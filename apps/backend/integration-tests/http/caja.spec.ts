import { cp, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import seedStore from "../../src/scripts/seed";
import importCatalog from "../../src/scripts/import-catalog";

/**
 * Caja de snacks (Fase CS): `catalog:import catalog/plantilla/caja` (diseno = caja, sin stock,
 * IVA reducido) y el hook validar-carrito: la línea de una caja exige «¿Para quién es?» válido
 * (lib/line-data.ts) y esos datos no valen en otros productos. Sin reservas (manage_inventory
 * false). Sin Stripe: el seed usa `pp_system_default`.
 */
jest.setTimeout(300 * 1000);

const PLANTILLA = path.join(__dirname, "../../catalog/plantilla");
type ApiError = { response: { status: number; data: { message?: string } } };
const fail = (e: ApiError) => e.response;

const TOBY = {
  caja_animal: "perro",
  caja_nombre: "Toby",
  caja_cachorro: false,
  caja_edad: 3,
  caja_peso: 12.5,
  caja_pelo: "igual",
  caja_mastica: ["engulle"],
  caja_ref: "0b8e7c2a-4d1f-4b6e-9a3c-5f2d1e0c9b8a",
};
const ref = () => ({ caja_ref: crypto.randomUUID() });

medusaIntegrationTestRunner({
  env: { STRIPE_API_KEY: "" },
  testSuite: ({ api, getContainer }) => {
    let container: MedusaContainer;
    let headers: Record<string, string>;
    let regionId: string;

    const variantId = async (sku: string) => {
      const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
        entity: "product_variant",
        fields: ["id"],
        filters: { sku },
      });
      return data[0]!.id;
    };
    const newCart = async () =>
      (await api.post("/store/carts", { region_id: regionId, email: "a@b.es" }, { headers })).data
        .cart as { id: string };
    const addLine = async (
      cartId: string,
      sku: string,
      metadata?: Record<string, unknown>,
      quantity = 1,
    ) =>
      api.post(
        `/store/carts/${cartId}/line-items`,
        { variant_id: await variantId(sku), quantity, ...(metadata ? { metadata } : {}) },
        { headers },
      );

    beforeEach(async () => {
      container = getContainer();
      await seedStore({ container } as Parameters<typeof seedStore>[0]);
      // Árbol de categorías + la caja + un producto normal del catálogo de ejemplo
      const dir = await mkdtemp(path.join(os.tmpdir(), "caja-"));
      await cp(path.join(PLANTILLA, "categorias.csv"), path.join(dir, "categorias.csv"));
      await importCatalog({ container, args: [dir] } as Parameters<typeof importCatalog>[0]);
      await rm(dir, { recursive: true, force: true });
      await importCatalog({
        container,
        args: [path.join(PLANTILLA, "caja")],
      } as Parameters<typeof importCatalog>[0]);
      await importCatalog({ container, args: [PLANTILLA] } as Parameters<typeof importCatalog>[0]);
      const [key] = await container.resolve(Modules.API_KEY).listApiKeys({ type: "publishable" });
      headers = { "x-publishable-api-key": key!.token };
      const [region] = await container.resolve(Modules.REGION).listRegions({});
      regionId = region!.id;
    });

    it("hoja: diseño caja, sin stock (sin artículo de inventario) e IVA reducido", async () => {
      const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
        entity: "product",
        fields: ["metadata", "type.value", "variants.sku", "variants.manage_inventory"],
        filters: { handle: "caja-snacks" },
      });
      const p = data[0]!;
      expect(p.metadata).toMatchObject({ diseno: "caja" });
      expect(p.type?.value).toBe("iva-reducido");
      expect(p.variants).toHaveLength(6);
      expect(p.variants!.every((v) => v!.manage_inventory === false)).toBe(true);
    });

    it("carrito: «¿Para quién es?» obligatorio y válido; solo en la caja", async () => {
      const cart = await newCart();
      const ok = await addLine(cart.id, "CAJA-SNACKS-25", TOBY);
      expect(ok.status).toBe(200);
      expect(ok.data.cart.items[0].unit_price).toBe(25);
      expect(ok.data.cart.items[0].metadata).toEqual(TOBY);
      // Otra caja con otros datos: otra línea
      const luna = await addLine(cart.id, "CAJA-SNACKS-25", {
        ...TOBY,
        ...ref(),
        caja_nombre: "Luna",
      });
      expect(luna.data.cart.items).toHaveLength(2);
      // Los mismos datos con otro caja_ref (otro envío del formulario): otra línea, no cantidad 2
      const again = await addLine(cart.id, "CAJA-SNACKS-25", { ...TOBY, ...ref() });
      expect(again.data.cart.items).toHaveLength(3);
      expect(again.data.cart.items.every((i: { quantity: number }) => i.quantity === 1)).toBe(true);

      // Cantidad 1 siempre: al añadir, al repetir la misma caja (mismo caja_ref) y al actualizar
      const two = await addLine(cart.id, "CAJA-SNACKS-15", { ...TOBY, ...ref() }, 2).catch(fail);
      expect(two.status).toBe(400);
      expect(two.data.message).toMatch(/su propia línea/);
      const same = await addLine(cart.id, "CAJA-SNACKS-25", TOBY).catch(fail);
      expect(same.status).toBe(400);
      expect(same.data.message).toMatch(/su propia línea/);
      const itemId = ok.data.cart.items[0].id as string;
      const up = await api
        .post(`/store/carts/${cart.id}/line-items/${itemId}`, { quantity: 2 }, { headers })
        .catch(fail);
      expect(up.status).toBe(400);
      expect(up.data.message).toMatch(/su propia línea/);
      // Quitarla (cantidad 0) sí
      const removed = await api.post(
        `/store/carts/${cart.id}/line-items/${itemId}`,
        { quantity: 0 },
        { headers },
      );
      expect(removed.status).toBe(200);
      expect(removed.data.cart.items).toHaveLength(2);

      const none = await addLine(cart.id, "CAJA-SNACKS-15").catch(fail);
      expect(none.status).toBe(400);
      expect(none.data.message).toMatch(/para quién es la caja de snacks/);
      const badWeight = await addLine(cart.id, "CAJA-SNACKS-15", {
        ...TOBY,
        caja_peso: 12.3,
      }).catch(fail);
      expect(badWeight.status).toBe(400);
      expect(badWeight.data.message).toMatch(/caja de snacks/);
      const puppy = await addLine(cart.id, "CAJA-SNACKS-15", {
        ...TOBY,
        ...ref(),
        caja_cachorro: true,
        caja_edad: 20,
      }).catch(fail);
      expect(puppy.status).toBe(400);
      const extra = await addLine(cart.id, "CAJA-SNACKS-15", {
        ...TOBY,
        ...ref(),
        precio: 1,
      }).catch(fail);
      expect(extra.status).toBe(400);

      // Los datos de una caja en otro producto: no
      const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
        entity: "product_variant",
        fields: ["sku", "manage_inventory"],
        filters: { sku: "COL-NYL-S-ROJ" },
      });
      const other = await addLine(cart.id, data[0]!.sku!, TOBY).catch(fail);
      expect(other.status).toBe(400);
      expect(other.data.message).toMatch(/no admite datos adicionales/);
    });
  },
});
