import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import {
  createApiKeysWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from "@medusajs/medusa/core-flows";
import { ACCOUNT_DELETION_REQUESTED } from "../../src/workflows/request-account-deletion";

/**
 * Cuenta de cliente (fase 9):
 * - Con `authVerificationsPerActor.customer`, no se puede iniciar sesión sin verificar el email.
 * - POST /store/customers/me/deletion-request: solo con sesión; emite el evento de baja.
 * - GET /store/customers/me/carts: último carrito sin completar y con artículos del cliente.
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
    /** Eventos emitidos (el proyecto usa event-bus-redis: se espía `emit`). */
    let events: { name: string; data: Record<string, unknown> }[];
    const email = "ana@example.com";
    const password = "Secreta-123";

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

    /** Espera a que se emita un evento (los de workflow salen al terminar, en segundo plano). */
    const waitEvent = async (name: string) => {
      for (let i = 0; i < 50; i++) {
        const found = events.find((e) => e.name === name);
        if (found) return found.data;
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error(`No se emitió ${name}`);
    };

    /** Registra la identidad y devuelve el token de login (o la respuesta de verificación). */
    const registerAndLogin = async () => {
      await api.post("/auth/customer/emailpass/register", { email, password });
      return api.post("/auth/customer/emailpass", { email, password });
    };

    /**
     * Flujo real de la fase 9: registro → login (pide verificación) → solicitud → confirmación
     * con el código del evento → login → crear cliente → login de nuevo (token con actor_id).
     */
    const verifiedCustomerToken = async () => {
      const first = await registerAndLogin();
      await api.post(
        "/auth/verification/request",
        { entity_id: email, entity_type: "email" },
        { headers: { authorization: `Bearer ${first.data.token}` } },
      );
      const { code } = await waitEvent("auth.verification_requested");
      await api.post("/auth/verification/confirm", { code });
      const login = await api.post("/auth/customer/emailpass", { email, password });
      expect(login.data.verification_required).toBeUndefined();
      await api.post(
        "/store/customers",
        { email },
        { headers: { ...headers, authorization: `Bearer ${login.data.token}` } },
      );
      const relogin = await api.post("/auth/customer/emailpass", { email, password });
      return relogin.data.token as string;
    };

    it("sin verificar el email, el login pide verificación", async () => {
      const res = await registerAndLogin();
      expect(res.data.verification_required).toBe(true);
      expect(typeof res.data.token).toBe("string");
      // El token sin verificar no sirve para la Store API del cliente.
      const me = await api
        .get("/store/customers/me", {
          headers: { ...headers, authorization: `Bearer ${res.data.token}` },
        })
        .catch(asRes);
      expect(me.status).toBe(401);
    });

    describe("GET /store/customers/me/carts", () => {
      it("401 sin sesión", async () => {
        const res = await api.get("/store/customers/me/carts", { headers }).catch(asRes);
        expect(res.status).toBe(401);
      });

      it("devuelve el carrito más reciente con artículos (no los vacíos ni los de otros)", async () => {
        const {
          result: [region],
        } = await createRegionsWorkflow(container).run({
          input: { regions: [{ name: "España", currency_code: "eur", countries: ["es"] }] },
        });
        const {
          result: [product],
        } = await createProductsWorkflow(container).run({
          input: {
            products: [
              {
                title: "Collar",
                status: "published",
                sales_channels: [{ id: channelId }],
                options: [{ title: "Talla", values: ["Única"] }],
                variants: [
                  {
                    title: "Única",
                    options: { Talla: "Única" },
                    manage_inventory: false,
                    prices: [{ currency_code: "eur", amount: 10 }],
                  },
                ],
              },
            ],
          },
        });
        const variantId = product!.variants[0]!.id;
        const token = await verifiedCustomerToken();
        const auth = { headers: { ...headers, authorization: `Bearer ${token}` } };

        const empty = await api.get("/store/customers/me/carts", auth);
        expect(empty.data.cart_id).toBeNull();

        // Carrito con artículos del cliente (creado con sesión) y, después, uno vacío.
        const withItems = await api.post("/store/carts", { region_id: region!.id }, auth);
        const cartId = withItems.data.cart.id as string;
        await api.post(
          `/store/carts/${cartId}/line-items`,
          { variant_id: variantId, quantity: 1 },
          auth,
        );
        await api.post("/store/carts", { region_id: region!.id }, auth);
        // Carrito de invitado con artículos: no es del cliente.
        const guest = await api.post("/store/carts", { region_id: region!.id }, { headers });
        await api.post(
          `/store/carts/${guest.data.cart.id}/line-items`,
          { variant_id: variantId, quantity: 1 },
          { headers },
        );

        const res = await api.get("/store/customers/me/carts", auth);
        expect(res.status).toBe(200);
        expect(res.data.cart_id).toBe(cartId);
      });
    });

    describe("POST /store/customers/me/deletion-request", () => {
      it("401 sin sesión", async () => {
        const res = await api
          .post("/store/customers/me/deletion-request", {}, { headers })
          .catch(asRes);
        expect(res.status).toBe(401);
      });

      it("con sesión: 202 y emite el evento con el id del cliente del token", async () => {
        const token = await verifiedCustomerToken();
        const auth = { headers: { ...headers, authorization: `Bearer ${token}` } };
        const me = await api.get("/store/customers/me", auth);

        // Campos fuera del esquema (p. ej. otro customer_id) → 400 (Medusa los rechaza).
        const extra = await api
          .post("/store/customers/me/deletion-request", { customer_id: "cus_otro" }, auth)
          .catch(asRes);
        expect(extra.status).toBe(400);
        const long = await api
          .post("/store/customers/me/deletion-request", { reason: "x".repeat(501) }, auth)
          .catch(asRes);
        expect(long.status).toBe(400);

        const res = await api.post(
          "/store/customers/me/deletion-request",
          { reason: "Ya no compro" },
          auth,
        );
        expect(res.status).toBe(202);
        const data = await waitEvent(ACCOUNT_DELETION_REQUESTED);
        expect(data.customer_id).toBe((me.data.customer as { id: string }).id);
        expect(data.reason).toBe("Ya no compro");
        // La bienvenida sale al crear el cliente con cuenta.
        expect(events.some((e) => e.name === "customer.created")).toBe(true);
      });
    });
  },
});
