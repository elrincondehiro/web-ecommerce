import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import {
  createApiKeysWorkflow,
  createProductsWorkflow,
  createSalesChannelsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from "@medusajs/medusa/core-flows";

/**
 * Lista de deseos (Fase L-1): rutas `/store/customers/me/wishlist*`.
 * - Solo con sesión (Medusa protege `/store/customers/me*`).
 * - Añadir es idempotente; producto + variante opcional; no se guardan productos en borrador,
 *   de otro canal ni descatalogados; quitar solo afecta a la lista propia.
 */
jest.setTimeout(120 * 1000);

type Res = { status: number; data: Record<string, unknown> };
const asRes = (e: { response: Res }) => e.response;

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, getContainer }) => {
    let container: MedusaContainer;
    let headers: Record<string, string>;
    let channelId: string;
    let events: { name: string; data: Record<string, unknown> }[];

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
      channelId = channel!.id;

      events = [];
      const eventBus = container.resolve(Modules.EVENT_BUS);
      const emit = eventBus.emit.bind(eventBus);
      jest.spyOn(eventBus, "emit").mockImplementation(async (data, options) => {
        for (const m of Array.isArray(data) ? data : [data]) {
          events.push({ name: m.name, data: m.data as Record<string, unknown> });
        }
        return emit(data, options);
      });
    });

    afterEach(() => jest.restoreAllMocks());

    const waitEvent = async (name: string, after = 0) => {
      for (let i = 0; i < 50; i++) {
        const found = events.slice(after).find((e) => e.name === name);
        if (found) return found.data;
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error(`No se emitió ${name}`);
    };

    /** Cliente con email verificado (flujo de la fase 9) → cabeceras con su token. */
    const customerAuth = async (email: string) => {
      const password = "Secreta-123";
      await api.post("/auth/customer/emailpass/register", { email, password });
      const first = await api.post("/auth/customer/emailpass", { email, password });
      const before = events.length;
      await api.post(
        "/auth/verification/request",
        { entity_id: email, entity_type: "email" },
        { headers: { authorization: `Bearer ${first.data.token}` } },
      );
      const { code } = await waitEvent("auth.verification_requested", before);
      await api.post("/auth/verification/confirm", { code });
      const login = await api.post("/auth/customer/emailpass", { email, password });
      await api.post(
        "/store/customers",
        { email },
        { headers: { ...headers, authorization: `Bearer ${login.data.token}` } },
      );
      const relogin = await api.post("/auth/customer/emailpass", { email, password });
      return { headers: { ...headers, authorization: `Bearer ${relogin.data.token}` } };
    };

    const product = async (
      title: string,
      opts: {
        status?: "published" | "draft";
        channel?: boolean;
        metadata?: Record<string, unknown>;
      } = {},
    ) => {
      const {
        result: [p],
      } = await createProductsWorkflow(container).run({
        input: {
          products: [
            {
              title,
              status: opts.status ?? "published",
              metadata: opts.metadata ?? {},
              sales_channels: opts.channel === false ? [] : [{ id: channelId }],
              options: [{ title: "Talla", values: ["S", "M"] }],
              variants: ["S", "M"].map((t) => ({
                title: t,
                options: { Talla: t },
                manage_inventory: false,
                prices: [{ currency_code: "eur", amount: 10 }],
              })),
            },
          ],
        },
      });
      return p!;
    };

    it("401 sin sesión (leer, añadir y quitar)", async () => {
      const get = await api.get("/store/customers/me/wishlist", { headers }).catch(asRes);
      const post = await api
        .post("/store/customers/me/wishlist/items", { product_id: "prod_x" }, { headers })
        .catch(asRes);
      const del = await api
        .delete("/store/customers/me/wishlist/items/wli_x", { headers })
        .catch(asRes);
      expect([get.status, post.status, del.status]).toEqual([401, 401, 401]);
    });

    it("añadir (idempotente), producto y variante por separado, listar y quitar", async () => {
      const auth = await customerAuth("ana@example.com");
      const p = await product("Collar");
      const variantId = p.variants[0]!.id;

      const empty = await api.get("/store/customers/me/wishlist", auth);
      expect(empty.data.items).toEqual([]);

      const first = await api.post(
        "/store/customers/me/wishlist/items",
        { product_id: p.id },
        auth,
      );
      expect(first.status).toBe(201);
      expect(first.data.created).toBe(true);
      const again = await api.post(
        "/store/customers/me/wishlist/items",
        { product_id: p.id },
        auth,
      );
      expect(again.status).toBe(200);
      expect(again.data.created).toBe(false);
      expect((again.data.item as { id: string }).id).toBe((first.data.item as { id: string }).id);

      // La variante es otra entrada (el producto sin variante ya estaba).
      const withVariant = await api.post(
        "/store/customers/me/wishlist/items",
        { product_id: p.id, variant_id: variantId },
        auth,
      );
      expect(withVariant.data.created).toBe(true);

      const list = await api.get("/store/customers/me/wishlist", auth);
      const items = list.data.items as { id: string; product_id: string; variant_id: string }[];
      expect(items).toHaveLength(2);
      expect(items.map((i) => i.variant_id).sort()).toEqual([null, variantId].sort());

      const del = await api.delete(
        `/store/customers/me/wishlist/items/${(first.data.item as { id: string }).id}`,
        auth,
      );
      expect(del.data.deleted).toBe(true);
      const after = await api.get("/store/customers/me/wishlist", auth);
      expect(after.data.items).toHaveLength(1);

      // Se puede volver a guardar tras quitarlo (índice único parcial con deleted_at).
      const readd = await api.post(
        "/store/customers/me/wishlist/items",
        { product_id: p.id },
        auth,
      );
      expect(readd.data.created).toBe(true);
    });

    it("rechaza borrador, otro canal, descatalogado, variante ajena y campos extra", async () => {
      const auth = await customerAuth("luis@example.com");
      const draft = await product("Borrador", { status: "draft" });
      const other = await product("Otro canal", { channel: false });
      const disc = await product("Viejo", { metadata: { descatalogado: true } });
      const a = await product("A");
      const b = await product("B");
      const post = (body: object) =>
        api.post("/store/customers/me/wishlist/items", body, auth).catch(asRes);

      expect((await post({ product_id: draft.id })).status).toBe(404);
      expect((await post({ product_id: other.id })).status).toBe(404);
      expect((await post({ product_id: disc.id })).status).toBe(400);
      expect((await post({ product_id: a.id, variant_id: b.variants[0]!.id })).status).toBe(400);
      expect((await post({ product_id: a.id, customer_id: "cus_otro" })).status).toBe(400);
      expect((await post({ product_id: "no-es-un-id" })).status).toBe(400);
      const list = await api.get("/store/customers/me/wishlist", auth);
      expect(list.data.items).toEqual([]);
    });

    it("cada cliente solo ve y quita lo suyo", async () => {
      const ana = await customerAuth("ana2@example.com");
      const luis = await customerAuth("luis2@example.com");
      const p = await product("Collar");
      const added = await api.post("/store/customers/me/wishlist/items", { product_id: p.id }, ana);
      const itemId = (added.data.item as { id: string }).id;

      expect((await api.get("/store/customers/me/wishlist", luis)).data.items).toEqual([]);
      const del = await api.delete(`/store/customers/me/wishlist/items/${itemId}`, luis);
      expect(del.data.deleted).toBe(false);
      expect((await api.get("/store/customers/me/wishlist", ana)).data.items).toHaveLength(1);
    });

    describe("compartir (L-1b)", () => {
      it("401 sin sesión al compartir; 404 con token mal formado o desconocido", async () => {
        const share = await api
          .post("/store/customers/me/wishlist/share", {}, { headers })
          .catch(asRes);
        expect(share.status).toBe(401);
        const statuses = [];
        for (const t of ["x", "a".repeat(43), "..%2F..%2Fadmin"]) {
          statuses.push((await api.get(`/store/wishlists/${t}`, { headers }).catch(asRes)).status);
        }
        expect(statuses).toEqual([404, 404, 404]);
      });

      it("compartir (idempotente), ver sin sesión sin datos personales, revocar y re-compartir", async () => {
        const auth = await customerAuth("comparte@example.com");
        const p = await product("Collar");
        await api.post(
          "/store/customers/me/wishlist/items",
          { product_id: p.id, variant_id: p.variants[0]!.id },
          auth,
        );
        const first = await api.post("/store/customers/me/wishlist/share", {}, auth);
        const token = first.data.token as string;
        expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
        const again = await api.post("/store/customers/me/wishlist/share", {}, auth);
        expect(again.data.token).toBe(token);
        expect((await api.get("/store/customers/me/wishlist", auth)).data.share_token).toBe(token);

        // Público: sin sesión, solo productos.
        const pub = await api.get(`/store/wishlists/${token}`, { headers });
        expect(pub.status).toBe(200);
        expect(pub.data).toEqual({
          items: [{ product_id: p.id, variant_id: p.variants[0]!.id }],
        });
        expect(JSON.stringify(pub.data)).not.toMatch(/comparte@|cus_|wl_|wli_/);

        // Revocar → 404; volver a compartir → otro token.
        const off = await api.delete("/store/customers/me/wishlist/share", auth);
        expect(off.data.shared).toBe(false);
        const gone = await api.get(`/store/wishlists/${token}`, { headers }).catch(asRes);
        expect(gone.status).toBe(404);
        expect((await api.get("/store/customers/me/wishlist", auth)).data.share_token).toBeNull();
        const renewed = await api.post("/store/customers/me/wishlist/share", {}, auth);
        expect(renewed.data.token).not.toBe(token);
      });

      it("compartir sin lista la crea vacía; revocar sin lista no falla", async () => {
        const auth = await customerAuth("vacia@example.com");
        const off = await api.delete("/store/customers/me/wishlist/share", auth);
        expect(off.data.shared).toBe(false);
        const { data } = await api.post("/store/customers/me/wishlist/share", {}, auth);
        const pub = await api.get(`/store/wishlists/${data.token}`, { headers });
        expect(pub.data.items).toEqual([]);
      });
    });
  },
});
