import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  createOrderFulfillmentWorkflow,
  updateInventoryLevelsWorkflow,
} from "@medusajs/medusa/core-flows";
import seedStore from "../../src/scripts/seed";
import importCatalog from "../../src/scripts/import-catalog";
import correasSync from "../../src/scripts/correas-sync";

/**
 * Correa a medida (Fase E-2): `correas:sync` sobre la plantilla, idempotencia, stock que no se
 * pisa, kit con cuerda decimal en el pedido y en el envío, demanda conjunta de piezas entre
 * líneas (sobreventa medida en E-2a), metadata de la línea y la ruta de disponibilidad.
 * Sin Stripe: el seed usa `pp_system_default`.
 */
jest.setTimeout(300 * 1000);

const PLANTILLA = path.join(__dirname, "../../catalog/plantilla");
type ApiError = { response: { status: number; data: { message?: string; code?: string } } };
const fail = (e: ApiError) => e.response;

medusaIntegrationTestRunner({
  inApp: true,
  env: { STRIPE_API_KEY: "" },
  testSuite: ({ api, getContainer }) => {
    let container: MedusaContainer;
    let dir: string;
    let headers: Record<string, string>;
    let regionId: string;

    const sync = (...args: string[]) =>
      correasSync({ container, args: [dir, ...args] } as Parameters<typeof correasSync>[0]);

    const query = () => container.resolve(ContainerRegistrationKeys.QUERY);
    const variantId = async (sku: string) => {
      const { data } = await query().graph({
        entity: "product_variant",
        fields: ["id"],
        filters: { sku },
      });
      return data[0]!.id;
    };
    const level = async (sku: string) => {
      const { data } = await query().graph({
        entity: "inventory_item",
        fields: [
          "location_levels.id",
          "location_levels.stocked_quantity",
          "location_levels.reserved_quantity",
          "location_levels.location_id",
          "id",
        ],
        filters: { sku },
      });
      const l = data[0]!.location_levels![0]!;
      return {
        id: l.id,
        inventory_item_id: data[0]!.id,
        location_id: l.location_id,
        stocked: Number(l.stocked_quantity),
        reserved: Number(l.reserved_quantity),
      };
    };
    const newCart = async () =>
      (await api.post("/store/carts", { region_id: regionId, email: "a@b.es" }, { headers })).data
        .cart as { id: string };
    const addLine = (
      cartId: string,
      sku: string,
      metadata?: Record<string, unknown>,
      quantity = 1,
    ) =>
      variantId(sku).then((id) =>
        api.post(
          `/store/carts/${cartId}/line-items`,
          { variant_id: id, quantity, ...(metadata ? { metadata } : {}) },
          { headers },
        ),
      );

    beforeAll(async () => {
      dir = await mkdtemp(path.join(os.tmpdir(), "correas-"));
      await cp(path.join(PLANTILLA, "correas"), dir, { recursive: true });
    });
    afterAll(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    beforeEach(async () => {
      container = getContainer();
      await seedStore({ container } as Parameters<typeof seedStore>[0]);
      // Solo el árbol de categorías de la plantilla (correas-perro dentro de paseo-perro)
      const cats = await mkdtemp(path.join(os.tmpdir(), "cats-"));
      await cp(path.join(PLANTILLA, "categorias.csv"), path.join(cats, "categorias.csv"));
      await importCatalog({ container, args: [cats] } as Parameters<typeof importCatalog>[0]);
      await rm(cats, { recursive: true, force: true });
      const [key] = await container.resolve(Modules.API_KEY).listApiKeys({ type: "publishable" });
      headers = { "x-publishable-api-key": key!.token };
      const [region] = await container.resolve(Modules.REGION).listRegions({});
      regionId = region!.id;
    });

    it("sync: crea 6 correas con kit; segunda pasada sin cambios y sin tocar stock", async () => {
      await sync("dry-run");
      expect(
        (await container.resolve(Modules.PRODUCT).listProducts({ handle: "correa-rojo-pvc" }))
          .length,
      ).toBe(0);
      await sync();
      const { data } = await query().graph({
        entity: "product",
        fields: [
          "handle",
          "metadata",
          "categories.handle",
          "variants.sku",
          "variants.weight",
          "variants.prices.amount",
          "variants.inventory_items.required_quantity",
          "variants.inventory_items.inventory.sku",
        ],
        filters: { handle: "correa-rojo-pvc" },
      });
      const p = data[0]!;
      expect(p.metadata).toMatchObject({ plantilla: "correa", grupo: "correa" });
      expect(p.categories!.map((c) => c!.handle)).toEqual(["correas-perro"]);
      expect(p.variants).toHaveLength(117);
      const v = p.variants!.find((x) => x!.sku === "CORREA-ROJO-PVC-07-MON-SEG")!;
      expect(Number(v.weight)).toBe(250 + 7 * 80);
      expect(Number((v as unknown as { prices: { amount: number }[] }).prices[0]!.amount)).toBe(38);
      expect(
        Object.fromEntries(
          v.inventory_items!.map((l) => [l!.inventory!.sku, Number(l!.required_quantity)]),
        ),
      ).toEqual({
        "CUERDA-ROJO-PVC": 7.5,
        "PIEZA-MOSQ-MON": 1,
        "PIEZA-MOSQ-SEG": 1,
        "PIEZA-ANILLA": 3,
        "PIEZA-HEBILLA": 2,
      });
      expect((await level("CUERDA-ROJO-PVC")).stocked).toBe(50);

      // Stock cambiado en el Admin + segunda pasada: no se pisa y no cambia nada
      const rope = await level("CUERDA-ROJO-PVC");
      await updateInventoryLevelsWorkflow(container).run({
        input: {
          updates: [
            {
              id: rope.id,
              inventory_item_id: rope.inventory_item_id,
              location_id: rope.location_id,
              stocked_quantity: 12.5,
            },
          ],
        },
      });
      const before = (
        await query().graph({
          entity: "product_variant",
          fields: ["id", "updated_at"],
          filters: { sku: "CORREA-ROJO-PVC-07-MON-SEG" },
        })
      ).data[0]!;
      await sync();
      const after = (
        await query().graph({
          entity: "product_variant",
          fields: ["id", "updated_at"],
          filters: { sku: "CORREA-ROJO-PVC-07-MON-SEG" },
        })
      ).data[0]!;
      expect(after.updated_at).toEqual(before.updated_at);
      expect((await level("CUERDA-ROJO-PVC")).stocked).toBe(12.5);

      // Cambio de hoja: precio de 3 m y un largo menos → se actualiza y se borran 9 variantes
      const file = path.join(dir, "correas.csv");
      const original = await readFile(file, "utf8");
      const lengths = path.join(dir, "largos.csv");
      const originalLengths = await readFile(lengths, "utf8");
      await writeFile(
        file,
        original.replace(/^(correa-rojo-pvc,[^,]+,Rojo,#[0-9A-F]{6},PVC,)25,/m, "$126,"),
      );
      await writeFile(lengths, originalLengths.replace(/^15,13\n/m, ""));
      await sync();
      const { data: changed } = await query().graph({
        entity: "product",
        fields: ["variants.sku", "variants.prices.amount"],
        filters: { handle: "correa-rojo-pvc" },
      });
      expect(changed[0]!.variants).toHaveLength(108);
      const v3 = changed[0]!.variants!.find((x) => x!.sku === "CORREA-ROJO-PVC-03-EST-EST")!;
      expect(Number((v3 as unknown as { prices: { amount: number }[] }).prices[0]!.amount)).toBe(
        26,
      );
      await writeFile(file, original);
      await writeFile(lengths, originalLengths);
    });

    it("carrito: demanda conjunta, metadata y ciclo pedido → reserva → envío con cuerda decimal", async () => {
      await sync();
      // 9 m de cuerda verde de PVC (plantilla): la de 9 m (9,5) no cabe, la de 8 m (8,5) sí
      const cart = await newCart();
      const nine = await addLine(cart.id, "CORREA-VERDE-PVC-09-EST-EST").catch(fail);
      expect(nine.status).toBe(400);
      const ok = await addLine(cart.id, "CORREA-VERDE-PVC-07-MON-SEG", {
        observaciones: "Nombre: Hiro",
        medida_cm: 650,
      });
      expect(ok.status).toBe(200);
      expect(ok.data.cart.items[0].unit_price).toBe(38);

      // Segunda correa con otras observaciones (otra línea): 7,5 + 7,5 > 9 m → rechazada
      const second = await addLine(cart.id, "CORREA-VERDE-PVC-07-MON-SEG", {
        observaciones: "Otra",
      }).catch(fail);
      expect(second.status).toBe(400);
      expect(second.data.message).toMatch(/No queda material suficiente/);
      // Subir la cantidad de la línea a 2 → Medusa ya lo rechaza (una línea)
      const itemId = ok.data.cart.items[0].id as string;
      const twice = await api
        .post(`/store/carts/${cart.id}/line-items/${itemId}`, { quantity: 2 }, { headers })
        .catch(fail);
      expect(twice.status).toBe(400);

      // Metadata: no válida en correas y prohibida en el resto
      const bad = await addLine(cart.id, "CORREA-AZUL-PVC-03-EST-EST", { medida_cm: 200 }).catch(
        fail,
      );
      expect(bad.status).toBe(400);
      expect(bad.data.message).toMatch(/de 2,01 a 3 m/);
      const long = await addLine(cart.id, "CORREA-AZUL-PVC-03-EST-EST", {
        observaciones: "x".repeat(201),
      }).catch(fail);
      expect(long.status).toBe(400);
      const extra = await addLine(cart.id, "CORREA-AZUL-PVC-03-EST-EST", { precio: 1 }).catch(fail);
      expect(extra.status).toBe(400);

      // Entre añadir y pagar baja el stock (otra venta, un ajuste): el hook de completar lo detecta
      const rope = await level("CUERDA-VERDE-PVC");
      const pay = async (cartId: string) => {
        await api.post(
          `/store/carts/${cartId}`,
          {
            shipping_address: {
              first_name: "A",
              last_name: "B",
              address_1: "C",
              city: "Madrid",
              postal_code: "28001",
              country_code: "es",
            },
          },
          { headers },
        );
        const opts = (await api.get(`/store/shipping-options?cart_id=${cartId}`, { headers })).data
          .shipping_options;
        await api.post(
          `/store/carts/${cartId}/shipping-methods`,
          { option_id: opts[0].id },
          { headers },
        );
        const pc = (await api.post("/store/payment-collections", { cart_id: cartId }, { headers }))
          .data.payment_collection;
        await api.post(
          `/store/payment-collections/${pc.id}/payment-sessions`,
          { provider_id: "pp_system_default" },
          { headers },
        );
        return api.post(`/store/carts/${cartId}/complete`, {}, { headers }).catch(fail);
      };

      // Un carrito con 2 líneas que caben en el momento de añadir, y luego baja el stock
      const tight = await newCart();
      await addLine(tight.id, "CORREA-VERDE-PVC-03-EST-EST", { observaciones: "una" });
      await addLine(tight.id, "CORREA-VERDE-PVC-03-EST-EST", { observaciones: "otra" });
      await updateInventoryLevelsWorkflow(container).run({
        input: {
          updates: [
            {
              id: rope.id,
              inventory_item_id: rope.inventory_item_id,
              location_id: rope.location_id,
              stocked_quantity: 6,
            },
          ],
        },
      });
      const blocked = await pay(tight.id);
      expect(blocked.status).toBe(400);
      expect(blocked.data.message).toMatch(/No queda material suficiente/);
      await updateInventoryLevelsWorkflow(container).run({
        input: {
          updates: [
            {
              id: rope.id,
              inventory_item_id: rope.inventory_item_id,
              location_id: rope.location_id,
              stocked_quantity: 9,
            },
          ],
        },
      });

      // Pedido del primer carrito: reserva 7,5 m y las piezas; el envío las descuenta
      const done = await pay(cart.id);
      expect(done.status).toBe(200);
      const order = (
        done.data as unknown as {
          order: {
            id: string;
            items: { id: string; quantity: number; metadata: Record<string, unknown> }[];
          };
        }
      ).order;
      expect(order.items[0]!.metadata).toEqual({ observaciones: "Nombre: Hiro", medida_cm: 650 });
      expect(await level("CUERDA-VERDE-PVC")).toMatchObject({ stocked: 9, reserved: 7.5 });
      expect(await level("PIEZA-MOSQ-MON")).toMatchObject({ stocked: 20, reserved: 1 });
      expect(await level("PIEZA-ANILLA")).toMatchObject({ reserved: 3 });
      const [loc] = await container.resolve(Modules.STOCK_LOCATION).listStockLocations({});
      await createOrderFulfillmentWorkflow(container).run({
        input: {
          order_id: order.id,
          location_id: loc!.id,
          items: order.items.map((i) => ({ id: i.id, quantity: i.quantity })),
        },
      });
      expect(await level("CUERDA-VERDE-PVC")).toMatchObject({ stocked: 1.5, reserved: 0 });
      expect(await level("PIEZA-MOSQ-SEG")).toMatchObject({ stocked: 9, reserved: 0 });
      expect(await level("PIEZA-HEBILLA")).toMatchObject({ stocked: 98, reserved: 0 });
    });

    it("disponibilidad: largo máximo y máscaras, sin cantidades", async () => {
      await sync();
      const res = await api.get("/store/correas/disponibilidad", { headers });
      expect(res.status).toBe(200);
      const byHandle = Object.fromEntries(
        (
          res.data.correas as { handle: string; max_m: number; masks: Record<string, number> }[]
        ).map((c) => [c.handle, c]),
      );
      expect(Object.keys(byHandle).sort()).toHaveLength(6);
      expect(byHandle["correa-rojo-nylon"]!.max_m).toBe(0); // rollo a 0
      expect(byHandle["correa-verde-pvc"]!.max_m).toBe(8); // 9 m de cuerda
      expect(byHandle["correa-azul-pvc"]!.max_m).toBe(15);
      expect(byHandle["correa-azul-pvc"]!.masks["3"]).toBe(0b111111111);
      // Seguridad: 10 en la plantilla → SEG-SEG (2) disponible; se agota con 1 libre
      const seg = await level("PIEZA-MOSQ-SEG");
      await updateInventoryLevelsWorkflow(container).run({
        input: {
          updates: [
            {
              id: seg.id,
              inventory_item_id: seg.inventory_item_id,
              location_id: seg.location_id,
              stocked_quantity: 1,
            },
          ],
        },
      });
      const after = (await api.get("/store/correas/disponibilidad", { headers })).data.correas as {
        handle: string;
        masks: Record<string, number>;
      }[];
      // orden EST, MON, SEG: bit = perro × 3 + mano; SEG-SEG = bit 8
      expect(after.find((c) => c.handle === "correa-azul-pvc")!.masks["3"]).toBe(0b011111111);
      expect(JSON.stringify(res.data)).not.toMatch(/quantity|stock/);
    });
  },
});
