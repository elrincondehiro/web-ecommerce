import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import { Modules, ProductStatus } from "@medusajs/framework/utils";
import {
  createApiKeysWorkflow,
  createInventoryLevelsWorkflow,
  createProductsWorkflow,
  createSalesChannelsWorkflow,
  createStockLocationsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateInventoryLevelsWorkflow,
  updateProductsWorkflow,
} from "@medusajs/medusa/core-flows";
import { syncStockToSearch } from "../../src/lib/search-stock-sync";

/**
 * Índice de búsqueda `product` (fase 7-1). En tests no hay Meilisearch: Medusa registra su
 * proveedor PostgreSQL por defecto (ver medusa-config) y el runner migra `src/search` solo.
 * La ingesta va por el subscriber `search-ingestion` (asíncrono), así que se reintenta.
 */
jest.setTimeout(120 * 1000);

type Hit = { document: { id: string; handle?: string; title?: string; in_stock?: boolean } };

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
  inApp: true,
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
    });
  },
});
