import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { updateInventoryLevelsWorkflow } from "@medusajs/medusa/core-flows";
import seedStore from "../../src/scripts/seed";
import importCatalog, { SALE_LIST_TITLE } from "../../src/scripts/import-catalog";

/**
 * Importador de catálogo (`catalog:import`) sobre la plantilla: carga, segunda carga sin
 * cambios, stock que no se pisa, variantes que no están en la hoja ignoradas y cambios de hoja.
 */
jest.setTimeout(240 * 1000);

const TEMPLATE = path.join(__dirname, "../../catalog/plantilla");
/** Precio base (`variants.prices` sí se resuelve en query.graph, pero no está en los tipos). */
const amount = (v: unknown) =>
  Number((v as { prices?: { amount: unknown }[] } | null | undefined)?.prices?.[0]?.amount);

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, getContainer }) => {
    let container: MedusaContainer;
    let dir: string;
    const run = (...args: string[]) =>
      importCatalog({ container, args: [dir, ...args] } as Parameters<typeof importCatalog>[0]);

    const product = async (handle: string) => {
      const query = container.resolve(ContainerRegistrationKeys.QUERY);
      const { data } = await query.graph({
        entity: "product",
        fields: [
          "id",
          "title",
          "status",
          "type.value",
          "categories.handle",
          "tags.value",
          "options.title",
          "metadata",
          "variants.sku",
          "variants.metadata",
          "variants.inventory_items.required_quantity",
          "variants.inventory_items.inventory.sku",
          "variants.inventory_items.inventory.unit_of_measure",
          "variants.weight",
          "variants.prices.amount",
          "variants.inventory_items.inventory.location_levels.stocked_quantity",
          "variants.inventory_items.inventory.location_levels.id",
          "variants.inventory_items.inventory.location_levels.inventory_item_id",
          "variants.inventory_items.inventory.location_levels.location_id",
        ],
        filters: { handle },
      });
      return data[0];
    };
    const variant = async (handle: string, sku: string) =>
      (await product(handle))?.variants?.find((v) => v?.sku === sku);
    const level = async (handle: string, sku: string) =>
      (await variant(handle, sku))?.inventory_items?.[0]?.inventory?.location_levels?.[0];

    beforeEach(async () => {
      container = getContainer();
      await seedStore({ container } as Parameters<typeof seedStore>[0]);
      dir = await mkdtemp(path.join(os.tmpdir(), "catalogo-"));
      await cp(TEMPLATE, dir, { recursive: true });
    });
    afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    it("dry-run no escribe nada", async () => {
      await run("dry-run");
      expect(await product("collar-nylon")).toBeUndefined();
    });

    it("carga la plantilla; la segunda carga no cambia nada; stock y extras se respetan", async () => {
      await run();

      const cats = await container
        .resolve(Modules.PRODUCT)
        .listProductCategories({}, { relations: ["parent_category"] });
      expect(cats.find((c) => c.handle === "pienso-perro")?.parent_category?.handle).toBe(
        "alimentacion-perro",
      );
      expect(cats.find((c) => c.handle === "libros-para-ti")?.is_active).toBe(false);

      const cam = await product("collar-nylon");
      expect(cam?.options?.map((o) => o?.title).sort()).toEqual(["Color", "Talla"]);
      expect(cam?.tags?.map((t) => t?.value).sort()).toEqual(["novedad", "reflectante"]);
      expect(cam?.categories?.map((c) => c?.handle)).toEqual(["collares-perro"]);
      const prices = Object.fromEntries((cam?.variants ?? []).map((v) => [v?.sku, amount(v)]));
      expect(prices).toEqual({
        "COL-NYL-S-ROJ": 12.95,
        "COL-NYL-S-AZU": 12.95,
        "COL-NYL-L-ROJ": 15.95,
        "COL-NYL-L-AZU": 15.95,
      });
      expect((await variant("collar-nylon", "COL-NYL-S-AZU"))?.weight).toBe(60);
      expect((await level("collar-nylon", "COL-NYL-S-ROJ"))?.stocked_quantity).toBe(10);
      expect((await product("guia-cachorro"))?.type?.value).toBe("iva-superreducido");
      const pienso = await product("pienso-pollo-adulto");
      expect(pienso?.metadata).toMatchObject({
        marca: "Hiro",
        proteina_pct: 26,
        fibra_pct: 2.5,
        humedad_pct: 9,
        "analitico:Calcio": "1,2 %",
      });
      expect(
        Object.fromEntries((pienso?.variants ?? []).map((v) => [v?.sku, v?.metadata?.neto_g])),
      ).toEqual({ "PIE-POL-AD-3KG": 3000, "PIE-POL-AD-12KG": 12000 });
      const taza = await product("taza-logo");
      expect(taza?.status).toBe("draft");
      expect(taza?.options?.map((o) => o?.title)).toEqual(["Formato"]);
      expect(taza?.variants?.map((v) => v?.sku)).toEqual(["TAZA-LOGO"]);

      const pricing = container.resolve(Modules.PRICING);
      const [list] = await pricing.listPriceLists({ q: SALE_LIST_TITLE });
      const sale = await pricing.listPrices({ price_list_id: [list!.id] });
      expect(sale.map((p) => Number(p.amount)).sort()).toEqual([0.09, 13.95, 13.95, 54.9]);

      // Se vende stock (simulado) y se vuelve a cargar: ni stock ni nada cambia
      const l = (await level("collar-nylon", "COL-NYL-S-ROJ"))!;
      await updateInventoryLevelsWorkflow(container).run({
        input: {
          updates: [
            {
              id: l.id,
              inventory_item_id: l.inventory_item_id,
              location_id: l.location_id,
              stocked_quantity: 7,
            },
          ],
        },
      });
      const before = await product("collar-nylon");
      await run();
      expect(await product("collar-nylon")).toEqual(before);
      expect((await level("collar-nylon", "COL-NYL-S-ROJ"))?.stocked_quantity).toBe(7);

      // Cambios en la hoja: precio, oferta quitada, variante nueva con valor nuevo, una fila fuera
      const file = path.join(dir, "productos.csv");
      const csv = (await readFile(file, "utf8"))
        .replace(
          'COL-NYL-S-ROJ,8400000000024,"12,95",,10',
          'COL-NYL-S-ROJ,8400000000024,"11,95",,10',
        )
        .replace('PIE-POL-AD-12KG,,"59,90","54,90"', 'PIE-POL-AD-12KG,,"59,90",-')
        .replace("L,Azul,,COL-NYL-L-AZU,,,,0,", "L,Verde,,COL-NYL-L-VER,,,,3,");
      await writeFile(file, csv);
      await run();
      const after = await product("collar-nylon");
      const skus = (after?.variants ?? []).map((v) => v?.sku).sort();
      // L Azul ya no está en la hoja: se ignora (sigue en Medusa)
      expect(skus).toEqual([
        "COL-NYL-L-AZU",
        "COL-NYL-L-ROJ",
        "COL-NYL-L-VER",
        "COL-NYL-S-AZU",
        "COL-NYL-S-ROJ",
      ]);
      expect(amount(await variant("collar-nylon", "COL-NYL-S-ROJ"))).toBe(11.95);
      // S Azul hereda el nuevo precio de S Rojo
      expect(amount(await variant("collar-nylon", "COL-NYL-S-AZU"))).toBe(11.95);
      expect((await level("collar-nylon", "COL-NYL-L-VER"))?.stocked_quantity).toBe(3);
      const sale2 = await pricing.listPrices({ price_list_id: [list!.id] });
      // L Verde hereda la oferta de L Rojo; la de L Azul (fuera de la hoja) se queda
      expect(sale2.map((p) => Number(p.amount)).sort()).toEqual([0.09, 13.95, 13.95, 13.95]);
    });

    it("granel: artículo en gramos, disponibilidad por pasos y mínimo en el carrito", async () => {
      await run();
      const alas = await product("alas-pollo-deshidratadas");
      const v = alas!.variants![0]!;
      expect(amount(v)).toBe(0.1);
      expect(v.metadata).toEqual({ paso_g: 5, min_g: 100 });
      expect(alas?.metadata).toMatchObject({ granel: true });
      const kit = v.inventory_items![0]!;
      expect(kit.required_quantity).toBe(5);
      expect(kit.inventory).toMatchObject({ sku: "ALA-POL-DES", unit_of_measure: "g" });
      expect(kit.inventory?.location_levels?.[0]?.stocked_quantity).toBe(2400);

      // Recarga: no crea otro artículo ni cambia nada
      const before = await product("alas-pollo-deshidratadas");
      await run();
      expect(await product("alas-pollo-deshidratadas")).toEqual(before);
      const inventory = container.resolve(Modules.INVENTORY);
      expect(await inventory.listInventoryItems({ sku: "ALA-POL-DES" })).toHaveLength(1);

      // Store API: 2400 g = 480 pasos de 5 g; mínimo 100 g = 20 pasos
      const [key] = await container.resolve(Modules.API_KEY).listApiKeys({ type: "publishable" });
      const headers = { "x-publishable-api-key": key!.token };
      const [region] = await container.resolve(Modules.REGION).listRegions({});
      const store = await api.get(
        `/store/products?handle=alas-pollo-deshidratadas&fields=*variants.calculated_price,+variants.inventory_quantity&region_id=${region!.id}`,
        { headers },
      );
      expect(store.data.products[0].variants[0].inventory_quantity).toBe(480);

      const cart = (await api.post("/store/carts", { region_id: region!.id }, { headers })).data
        .cart;
      const add = (quantity: number) =>
        api
          .post(`/store/carts/${cart.id}/line-items`, { variant_id: v.id, quantity }, { headers })
          .catch((e: { response: { status: number; data: { message: string } } }) => e.response);
      const low = await add(19);
      expect(low.status).toBe(400);
      expect(low.data.message).toBe(
        "El mínimo de este producto a granel es 100 g (20 unidades de 5 g).",
      );
      const ok = await add(20);
      expect(ok.status).toBe(200);
      const item = ok.data.cart.items[0];
      expect(item.quantity).toBe(20);
      // Añadir menos del mínimo a una línea que ya lo cumple: vale (suma 21)
      expect((await add(1)).status).toBe(200);
      // Bajar la línea por debajo del mínimo: no; quitarla (0): sí
      const update = (quantity: number) =>
        api
          .post(`/store/carts/${cart.id}/line-items/${item.id}`, { quantity }, { headers })
          .catch((e: { response: { status: number } }) => e.response);
      expect((await update(10)).status).toBe(400);
      // Más pasos de los que hay en stock
      expect((await update(481)).status).toBe(400);
      expect((await update(480)).status).toBe(200);
      expect((await update(0)).status).toBe(200);
    });

    it("descatalogado: metadata, sustituto y el carrito no deja añadirlo (Fase E)", async () => {
      await run();
      // Segunda carga con una hoja mínima (solo lo que cambia; lo demás no se toca)
      const file = path.join(dir, "productos.csv");
      const sheet = (flag: string, replacement: string) =>
        writeFile(
          file,
          `handle,descatalogado,sustituto,sku,precio\nguia-cachorro,${flag},${replacement},LIB-GUIA-CACH,"14,90"\n`,
        );
      await sheet("sí", "collar-nylon");
      await run();
      const guia = await product("guia-cachorro");
      expect(guia?.status).toBe("published");
      expect(guia?.metadata).toMatchObject({ descatalogado: true, sustituto: "collar-nylon" });

      const [key] = await container.resolve(Modules.API_KEY).listApiKeys({ type: "publishable" });
      const headers = { "x-publishable-api-key": key!.token };
      const [region] = await container.resolve(Modules.REGION).listRegions({});
      const cart = (await api.post("/store/carts", { region_id: region!.id }, { headers })).data
        .cart;
      const variantId = (
        await api.get(`/store/products?handle=guia-cachorro&fields=variants.id`, { headers })
      ).data.products[0].variants[0].id;
      const res = await api
        .post(
          `/store/carts/${cart.id}/line-items`,
          { variant_id: variantId, quantity: 1 },
          { headers },
        )
        .catch((e: { response: { status: number; data: { message: string } } }) => e.response);
      expect(res.status).toBe(400);
      expect(res.data.message).toBe("Este producto está descatalogado y ya no se puede comprar.");

      // Sustituto que no existe: error de la hoja
      await sheet("sí", "no-existe");
      await expect(run()).rejects.toThrow(/errores en las hojas/);

      // Volver a catalogarlo («no») y borrar el sustituto («-»)
      await sheet("no", "-");
      await run();
      const back = await product("guia-cachorro");
      expect(back?.metadata?.descatalogado).toBeUndefined();
      expect(back?.metadata?.sustituto).toBeUndefined();
    });

    it("una hoja con errores no escribe nada", async () => {
      const file = path.join(dir, "productos.csv");
      await writeFile(file, (await readFile(file, "utf8")).replace("pienso-perro,", "no-existe,"));
      await expect(run()).rejects.toThrow(/errores en las hojas/);
      expect(await product("collar-nylon")).toBeUndefined();
    });
  },
});
