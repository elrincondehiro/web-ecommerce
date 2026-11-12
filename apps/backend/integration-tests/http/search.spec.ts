import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import { Modules, ProductStatus } from "@medusajs/framework/utils";
import {
  createApiKeysWorkflow,
  createInventoryLevelsWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  createSalesChannelsWorkflow,
  createStockLocationsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateInventoryLevelsWorkflow,
  updateProductOptionValuesWorkflow,
  updateProductOptionsWorkflow,
  updateProductVariantsWorkflow,
  updateProductsWorkflow,
} from "@medusajs/medusa/core-flows";
import { syncStockToSearch } from "../../src/lib/search-stock-sync";
import { COLOR_FAMILIES } from "../../src/lib/option-families";
import { SEARCH_LOG_MODULE } from "../../src/modules/search-log";
import type SearchLogModuleService from "../../src/modules/search-log/service";
import searchLogged from "../../src/subscribers/search-logged";
import searchLogPurgeJob from "../../src/jobs/search-log-purge";
import { SEARCH_LOGGED, weekStart } from "../../src/lib/search-log";

/**
 * Índice de búsqueda `product` (fase 7-1). En tests no hay Meilisearch: Medusa registra su
 * proveedor PostgreSQL por defecto (ver medusa-config) y el runner migra `src/search` solo.
 * La ingesta va por el subscriber `search-ingestion` (asíncrono), así que se reintenta.
 */
jest.setTimeout(120 * 1000);

type Hit = {
  document: {
    id: string;
    handle?: string;
    title?: string;
    in_stock?: boolean;
    min_price_eur?: number;
  };
};

async function eventually<T>(fn: () => Promise<T>, ok: (v: T) => boolean, ms = 30_000) {
  const end = Date.now() + ms;
  let last: T = await fn();
  while (!ok(last) && Date.now() < end) {
    await new Promise((r) => setTimeout(r, 500));
    last = await fn();
  }
  return last;
}

medusaIntegrationTestRunner({
  env: {},
  testSuite: ({ api, getContainer }) => {
    let container: MedusaContainer;
    let headers: Record<string, string>;
    let published: { id: string; handle: string; inventoryItemId: string; locationId: string };

    const search = async (filters: Record<string, unknown>): Promise<Hit[]> => {
      const res = await api.post(
        "/store/search",
        { entity: "product", filters, pagination: { take: 20 } },
        { headers },
      );
      return res.data.results[0]?.hits ?? [];
    };
    const byHandle = async (handle: string) =>
      (await search({ handle })).find((h) => h.document.handle === handle);

    // El runner toma la plantilla de BD tras los beforeAll (y la restaura en cada test). El seed
    // inicial del índice corre en segundo plano al arrancar: se espera a que esté listo para que
    // la plantilla ya tenga versión activa (si no, cada test arranca sin índice).
    beforeAll(async () => {
      const searchModule = getContainer().resolve(Modules.SEARCH);
      const ready = await eventually(
        () => searchModule.listIndexes(),
        (indexes) => indexes.some((i) => i.name === "product" && i.status === "ready"),
      );
      expect(ready.find((i) => i.name === "product")?.status).toBe("ready");
    });

    beforeEach(async () => {
      container = getContainer();
      const {
        result: [salesChannel],
      } = await createSalesChannelsWorkflow(container).run({
        input: { salesChannelsData: [{ name: "Tienda test" }] },
      });
      const {
        result: [apiKey],
      } = await createApiKeysWorkflow(container).run({
        input: { api_keys: [{ title: "test", type: "publishable", created_by: "" }] },
      });
      await linkSalesChannelsToApiKeyWorkflow(container).run({
        input: { id: apiKey!.id, add: [salesChannel!.id] },
      });
      const {
        result: [location],
      } = await createStockLocationsWorkflow(container).run({
        input: { locations: [{ name: "Almacén test" }] },
      });
      await linkSalesChannelsToStockLocationWorkflow(container).run({
        input: { id: location!.id, add: [salesChannel!.id] },
      });

      const { result: products } = await createProductsWorkflow(container).run({
        input: {
          products: [ProductStatus.PUBLISHED, ProductStatus.DRAFT].map((status) => ({
            title: `Lámpara ${status}`,
            handle: `lampara-${status}`,
            status,
            sales_channels: [{ id: salesChannel!.id }],
            options: [{ title: "Color", values: ["Rojo"] }],
            variants: [
              {
                title: "Rojo",
                sku: `LAMPARA-${status}`.toUpperCase(),
                options: { Color: "Rojo" },
                manage_inventory: true,
                prices: [{ currency_code: "eur", amount: 10 }],
              },
            ],
          })),
        },
      });

      const query = container.resolve("query");
      const { data: variants } = await query.graph({
        entity: "product_variant",
        fields: ["product_id", "inventory_items.inventory_item_id"],
        filters: { product_id: products.map((p) => p.id) },
      });
      const itemOf = (productId: string) =>
        (
          variants.find((v) => v.product_id === productId)?.inventory_items as
            { inventory_item_id: string }[] | undefined
        )?.[0]?.inventory_item_id as string;
      await createInventoryLevelsWorkflow(container).run({
        input: {
          inventory_levels: products.map((p) => ({
            inventory_item_id: itemOf(p.id),
            location_id: location!.id,
            stocked_quantity: 5,
          })),
        },
      });

      const pub = products.find((p) => p.status === ProductStatus.PUBLISHED)!;
      published = {
        id: pub.id,
        handle: pub.handle,
        inventoryItemId: itemOf(pub.id),
        locationId: location!.id,
      };
      headers = { "x-publishable-api-key": apiKey!.token };
    });

    describe("POST /store/search (índice product)", () => {
      it("indexa el producto publicado con in_stock", async () => {
        // El seed corre al arrancar, antes de crear los datos: el producto llega por eventos.
        // `in_stock` se calcula al indexar; el nivel se crea después, así que se fuerza una pasada.
        await syncStockToSearch(container);
        const hit = await eventually(
          () => byHandle(published.handle),
          (h) => h?.document.in_stock === true,
        );
        expect(hit?.document).toMatchObject({ id: published.id, in_stock: true });
      });

      it("no devuelve productos en borrador", async () => {
        await eventually(
          () => byHandle(published.handle),
          (h) => Boolean(h),
        );
        const hits = await search({ q: "lámpara" });
        expect(hits.map((h) => h.document.handle)).toContain(published.handle);
        expect(hits.map((h) => h.document.handle)).not.toContain("lampara-draft");
      });

      it("refleja product.updated", async () => {
        await eventually(
          () => byHandle(published.handle),
          (h) => Boolean(h),
        );
        await updateProductsWorkflow(container).run({
          input: { selector: { id: published.id }, update: { title: "Flexo articulado" } },
        });
        const hit = await eventually(
          () => byHandle(published.handle),
          (h) => h?.document.title === "Flexo articulado",
        );
        expect(hit?.document.title).toBe("Flexo articulado");
      });

      it("el job de stock pasa in_stock a false al agotarse", async () => {
        await syncStockToSearch(container);
        await eventually(
          () => byHandle(published.handle),
          (h) => h?.document.in_stock === true,
        );
        await updateInventoryLevelsWorkflow(container).run({
          input: {
            updates: [
              {
                inventory_item_id: published.inventoryItemId,
                location_id: published.locationId,
                stocked_quantity: 0,
              },
            ],
          },
        });
        await syncStockToSearch(container);
        const hit = await eventually(
          () => byHandle(published.handle),
          (h) => h?.document.in_stock === false,
        );
        expect(hit?.document.in_stock).toBe(false);
      });

      it("option_families (FO-3): cambiar las familias de un valor reindexa sus productos", async () => {
        await eventually(
          () => byHandle(published.handle),
          (h) => Boolean(h),
        );
        // Lo que hacen catalog:import (familias.csv) y el widget: los workflows oficiales, que
        // emiten product-option.updated y product-option-value.updated (sin tocar el producto)
        // La opción «Color» de la lámpara PUBLICADA (cada lámpara del beforeEach crea la suya:
        // con `title` a secas saldría a veces la del borrador, que el índice no tiene)
        const query = container.resolve("query");
        const {
          data: [withOptions],
        } = await query.graph({
          entity: "product",
          fields: ["options.id", "options.title", "options.values.id", "options.values.value"],
          filters: { id: published.id },
        });
        const option = withOptions!.options!.find((o) => o?.title === "Color")!;
        await updateProductOptionsWorkflow(container).run({
          input: {
            selector: { id: option.id },
            update: { metadata: { familias: COLOR_FAMILIES } },
          },
        });
        const inFamily = (key: string) => search({ $and: [{ option_families: { $in: [key] } }] });
        // 1) Valor con familia y opción reindexada: «Color:rojo»
        const rojo = option.values!.find((v) => v?.value === "Rojo")!;
        await updateProductOptionValuesWorkflow(container).run({
          input: { id: rojo.id, update: { metadata: { familias: ["rojo"] } } },
        });
        await eventually(
          () => inFamily("Color:rojo"),
          (h) => h.some((x) => x.document.handle === published.handle),
        );
        // 2) Solo cambia el VALOR: lo reindexa product-option-value.updated (el de la opción ya
        // pasó). Sin ese evento en src/search/product.ts el producto seguiría en «Color:rojo».
        await updateProductOptionValuesWorkflow(container).run({
          input: { id: rojo.id, update: { metadata: { familias: ["rosa"] } } },
        });
        const hits = await eventually(
          () => inFamily("Color:rosa"),
          (h) => h.some((x) => x.document.handle === published.handle),
        );
        expect(hits.map((h) => h.document.handle)).toContain(published.handle);
        // El borrador no sale (como siempre) y otra familia no lo encuentra
        expect(hits.map((h) => h.document.handle)).not.toContain("lampara-draft");
        expect((await inFamily("Color:rojo")).map((h) => h.document.handle)).not.toContain(
          published.handle,
        );
      });

      it("category_tree_handles: el filtro por un padre incluye las subcategorías (S-1)", async () => {
        const {
          result: [raiz],
        } = await createProductCategoriesWorkflow(container).run({
          input: { product_categories: [{ name: "Perro", handle: "perro-t", is_active: true }] },
        });
        const {
          result: [hoja],
        } = await createProductCategoriesWorkflow(container).run({
          input: {
            product_categories: [
              {
                name: "Piensos",
                handle: "piensos-perro-t",
                parent_category_id: raiz!.id,
                is_active: true,
              },
            ],
          },
        });
        await updateProductsWorkflow(container).run({
          input: { selector: { id: published.id }, update: { category_ids: [hoja!.id] } },
        });
        const inTree = (handle: string) =>
          search({ $and: [{ category_tree_handles: { $in: [handle] } }] });
        const hits = await eventually(
          () => inTree("perro-t"),
          (h) => h.some((x) => x.document.handle === published.handle),
        );
        expect(hits.map((h) => h.document.handle)).toContain(published.handle);
        expect((await inTree("piensos-perro-t")).map((h) => h.document.handle)).toContain(
          published.handle,
        );
        // category_handles sigue siendo solo la categoría directa (S-1)
        const direct = await search({ $and: [{ category_handles: { $in: ["perro-t"] } }] });
        expect(direct.map((h) => h.document.handle)).not.toContain(published.handle);
      });

      it("proteina_ms / grasa_ms: rango sobre materia seca (S-2)", async () => {
        // 25 % de proteína con 9 % de humedad → 27,5 % s.m.; grasa 15 % → 16,5 % s.m.
        await updateProductsWorkflow(container).run({
          input: {
            selector: { id: published.id },
            update: { metadata: { proteina_pct: 25, grasa_pct: 15, humedad_pct: 9 } },
          },
        });
        const range = (field: string, $gte: number, $lte: number) =>
          search({ $and: [{ [field]: { $gte, $lte } }] });
        const hits = await eventually(
          () => range("proteina_ms", 27, 28),
          (h) => h.some((x) => x.document.handle === published.handle),
        );
        expect(hits.map((h) => h.document.handle)).toContain(published.handle);
        expect((await range("proteina_ms", 28, 100)).map((h) => h.document.handle)).not.toContain(
          published.handle,
        );
        expect((await range("grasa_ms", 16, 17)).map((h) => h.document.handle)).toContain(
          published.handle,
        );
        // MK-C: has_analytics (humedad + proteína) para el comparador
        const analytic = await search({ $and: [{ has_analytics: true }] });
        expect(analytic.map((h) => h.document.handle)).toContain(published.handle);
      });

      it("has_analytics (MK-C): sin datos analíticos, false", async () => {
        const hits = await eventually(
          () => search({ $and: [{ has_analytics: false }] }),
          (h) => h.some((x) => x.document.handle === published.handle),
        );
        expect(hits.map((h) => h.document.handle)).toContain(published.handle);
      });

      it("proteina_ms / grasa_ms ordenables (MK-C): de más a menos", async () => {
        await updateProductsWorkflow(container).run({
          input: {
            selector: { id: published.id },
            update: { metadata: { proteina_pct: 25, grasa_pct: 15, humedad_pct: 9 } },
          },
        });
        const sorted = (field: string) =>
          api
            .post(
              "/store/search",
              {
                entity: "product",
                fields: ["id"],
                filters: { $and: [{ [field]: { $gte: 0 } }] },
                pagination: { take: 20, order: { [field]: "DESC" } },
              },
              { headers },
            )
            .then((r: { data: { results: { hits: Hit[] }[] } }) => r.data.results[0]?.hits ?? []);
        const hits = await eventually(
          () => sorted("proteina_ms"),
          (h: Hit[]) => h.some((x) => x.document.id === published.id),
        );
        expect(hits.map((h: Hit) => h.document.id)).toContain(published.id);
        // Un campo no ordenable falla: así se sabe que el orden está declarado.
        const bad = await api
          .post(
            "/store/search",
            {
              entity: "product",
              filters: {},
              pagination: { take: 1, order: { in_stock: "DESC" } },
            },
            { headers },
          )
          .catch((e: { response: { status: number } }) => e.response);
        expect(bad.status).toBeGreaterThanOrEqual(400);
        expect((await sorted("grasa_ms")).length).toBeGreaterThan(0);
      });

      it("granel (S-3): min_price_eur es el precio del mínimo, no el de un paso", async () => {
        // Precio de un paso: 10 € (el de la lámpara); paso 5 g, mínimo 100 g → 20 pasos = 200 €
        await updateProductVariantsWorkflow(container).run({
          input: {
            selector: { product_id: published.id },
            update: { metadata: { paso_g: 5, min_g: 100 } },
          },
        });
        // product-variant.updated reindexa el producto (events de src/search/product.ts)
        const hit = await eventually(
          () => byHandle(published.handle),
          (h) => h?.document.min_price_eur === 200,
        );
        expect(hit?.document.min_price_eur).toBe(200);
      });

      it("descatalogado (Fase E): fuera con el filtro del storefront `discontinued $ne true`", async () => {
        const listed = { $and: [{ discontinued: { $ne: true } }] };
        const handles = async () => (await search(listed)).map((h) => h.document.handle);
        // Sin la marca, el filtro lo incluye
        await eventually(handles, (h) => h.includes(published.handle));
        await updateProductsWorkflow(container).run({
          input: { selector: { id: published.id }, update: { metadata: { descatalogado: true } } },
        });
        const after = await eventually(handles, (h) => !h.includes(published.handle));
        expect(after).not.toContain(published.handle);
        // Sin filtro sigue indexado (la ficha existe; solo se oculta de la búsqueda)
        expect((await search({})).map((h) => h.document.handle)).toContain(published.handle);
      });
    });

    describe("estadísticas de búsquedas (Fase MK-E2)", () => {
      let events: { name: string; data: { term: string; total: number } }[];
      beforeEach(() => {
        events = [];
        const bus = container.resolve(Modules.EVENT_BUS);
        const emit = bus.emit.bind(bus);
        jest.spyOn(bus, "emit").mockImplementation(async (d, o) => {
          for (const m of Array.isArray(d) ? d : [d]) {
            if (m.name === SEARCH_LOGGED) events.push(m as (typeof events)[number]);
          }
          return emit(d, o);
        });
      });
      afterEach(() => jest.restoreAllMocks());

      const logged = async (q: string, log: boolean) => {
        const before = events.length;
        const res = await api.post(
          "/store/search",
          { queries: [{ entity: "product", filters: { q }, pagination: { take: 1 } }] },
          { headers: log ? { ...headers, "x-search-log": "1" } : headers },
        );
        await new Promise((r) => setTimeout(r, 300));
        return { res, event: events.slice(before)[0] };
      };
      const svc = () => container.resolve<SearchLogModuleService>(SEARCH_LOG_MODULE);
      const admin = async () => {
        const email = `admin-${Date.now()}@example.com`;
        const password = "Admin-123456";
        const user = await container.resolve(Modules.USER).createUsers({ email });
        const auth = container.resolve(Modules.AUTH);
        const { authIdentity } = await auth.register("emailpass", {
          body: { email, password },
        } as never);
        await auth.updateAuthIdentities({
          id: authIdentity!.id,
          app_metadata: { user_id: user.id },
        });
        const login = await api.post("/auth/user/emailpass", { email, password });
        return { headers: { authorization: `Bearer ${login.data.token}` } };
      };

      it("solo con la cabecera; término normalizado y total; sin datos personales", async () => {
        const noLog = await logged("Lámpara", false);
        expect(noLog.res.status).toBe(200);
        expect(noLog.event).toBeUndefined();

        const hit = await logged("  LÁMPARA ", true);
        expect(hit.res.data.results).toHaveLength(1); // la respuesta no cambia
        expect(hit.event?.data).toEqual({ term: "lampara", total: expect.any(Number) });
        expect((await logged("ana@correo.es", true)).event).toBeUndefined();
        expect((await logged("600123456", true)).event).toBeUndefined();

        const miss = await logged("rascador gigante", true);
        expect(miss.event?.data).toEqual({ term: "rascador gigante", total: 0 });
      });

      it("suma por término y semana; Admin, CSV y borrado a las 52 semanas", async () => {
        const run = (term: string, total: number) =>
          searchLogged({
            event: { name: SEARCH_LOGGED, data: { term, total } },
            container,
          } as Parameters<typeof searchLogged>[0]);
        await Promise.all([run("arnes gato", 0), run("arnes gato", 0), run("correa", 7)]);
        await run("arnes gato", 2);
        const old = weekStart(new Date(Date.now() - 60 * 7 * 86_400_000));
        await svc().record("viejo", old, 0);

        const auth = await admin();
        const { data } = await api.get("/admin/search-terms?dias=30", auth);
        expect(data.rows).toEqual([
          {
            term: "arnes gato",
            count: 3,
            zero: 2,
            last_total: 2,
            last_week: weekStart(new Date()),
          },
          { term: "correa", count: 1, zero: 0, last_total: 7, last_week: weekStart(new Date()) },
        ]);
        const csv = await api.get("/admin/search-terms?dias=365&formato=csv", auth);
        expect(csv.headers["content-type"]).toMatch(/text\/csv/);
        expect(csv.headers["content-disposition"]).toMatch(/attachment; filename="busquedas-365d-/);
        expect(csv.data).toContain('"arnes gato";3;2;2;');

        await searchLogPurgeJob(container);
        const all = await svc().summary("2000-01-01");
        expect(all.map((r) => r.term).sort()).toEqual(["arnes gato", "correa"]);
        await expect(api.get("/admin/search-terms")).rejects.toMatchObject({
          response: { status: 401 },
        });
      });
    });
  },
});
