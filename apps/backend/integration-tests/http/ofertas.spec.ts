import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ProductStatus } from "@medusajs/framework/utils";
import {
  createApiKeysWorkflow,
  createPriceListsWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from "@medusajs/medusa/core-flows";

/**
 * GET /store/ofertas (fase I-Interficie, D5 = A): productos con precio rebajado por una
 * Price List `sale` vigente, del canal de la publishable key.
 */
jest.setTimeout(120 * 1000);

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, getContainer }) => {
    let container: MedusaContainer;
    let headers: Record<string, string>;
    let regionId: string;
    let ids: Record<"rebajado" | "normal" | "borrador" | "futuro", string>;

    beforeEach(async () => {
      container = getContainer();
      const {
        result: [channel],
      } = await createSalesChannelsWorkflow(container).run({
        input: { salesChannelsData: [{ name: "Tienda test" }] },
      });
      const {
        result: [apiKey],
      } = await createApiKeysWorkflow(container).run({
        input: { api_keys: [{ title: "test", type: "publishable", created_by: "" }] },
      });
      await linkSalesChannelsToApiKeyWorkflow(container).run({
        input: { id: apiKey!.id, add: [channel!.id] },
      });
      headers = { "x-publishable-api-key": apiKey!.token };
      const {
        result: [region],
      } = await createRegionsWorkflow(container).run({
        input: { regions: [{ name: "España", currency_code: "eur", countries: ["es"] }] },
      });
      regionId = region!.id;

      const make = (handle: string, status: ProductStatus) => ({
        title: handle,
        handle,
        status,
        sales_channels: [{ id: channel!.id }],
        options: [{ title: "Talla", values: ["Única"] }],
        variants: [
          {
            title: "Única",
            sku: handle.toUpperCase(),
            options: { Talla: "Única" },
            manage_inventory: false,
            prices: [{ currency_code: "eur", amount: 10 }],
          },
        ],
      });
      const { result: products } = await createProductsWorkflow(container).run({
        input: {
          products: [
            make("rebajado", ProductStatus.PUBLISHED),
            make("normal", ProductStatus.PUBLISHED),
            make("borrador", ProductStatus.DRAFT),
            make("futuro", ProductStatus.PUBLISHED),
          ],
        },
      });
      const byHandle = (h: string) => products.find((p) => p.handle === h)!;
      ids = {
        rebajado: byHandle("rebajado").id,
        normal: byHandle("normal").id,
        borrador: byHandle("borrador").id,
        futuro: byHandle("futuro").id,
      };
      const variant = (h: string) => byHandle(h).variants[0]!.id;
      const price = (h: string) => ({ variant_id: variant(h), currency_code: "eur", amount: 8 });

      await createPriceListsWorkflow(container).run({
        input: {
          price_lists_data: [
            {
              title: "Rebajas",
              description: "test",
              status: "active",
              prices: [price("rebajado"), price("borrador")],
            },
            {
              title: "Black Friday",
              description: "test (futura)",
              status: "active",
              starts_at: new Date(Date.now() + 86_400_000).toISOString(),
              prices: [price("futuro")],
            },
          ],
        },
      });
    });

    describe("GET /store/ofertas", () => {
      it("devuelve solo productos publicados con oferta vigente", async () => {
        const res = await api.get(`/store/ofertas?region_id=${regionId}`, { headers });
        expect(res.status).toBe(200);
        expect(res.data.product_ids).toEqual([ids.rebajado]);
      });

      it("el producto rebajado tiene calculated (sale) < original en /store/products", async () => {
        const res = await api.get(
          `/store/products?id=${ids.rebajado}&region_id=${regionId}&fields=*variants.calculated_price`,
          { headers },
        );
        const p = res.data.products[0].variants[0].calculated_price;
        expect(p.calculated_amount).toBe(8);
        expect(p.original_amount).toBe(10);
        expect(p.calculated_price.price_list_type).toBe("sale");
      });

      it("exige region_id", async () => {
        const res = await api
          .get("/store/ofertas", { headers })
          .catch((e: { response: { status: number } }) => e.response);
        expect(res.status).toBe(400);
      });

      it("404 si la región no existe", async () => {
        const res = await api
          .get("/store/ofertas?region_id=reg_nope", { headers })
          .catch((e: { response: { status: number } }) => e.response);
        expect(res.status).toBe(404);
      });
    });
  },
});
