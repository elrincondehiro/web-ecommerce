import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import {
  createApiKeysWorkflow,
  createSalesChannelsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from "@medusajs/medusa/core-flows";
import { unsubscribeToken } from "../../src/lib/comms-token";
import { COMMS_MODULE } from "../../src/modules/comms";
import type CommsModuleService from "../../src/modules/comms/service";
import commsCustomerDeleted from "../../src/subscribers/comms-customer-deleted";
import { sendMarketingEmail } from "../../src/subscribers/_email";

/**
 * Comunicaciones (Fase MK-A): `/store/customers/me/comms`, `/store/comms/unsubscribe`,
 * `/admin/customers/:id/comms` y `sendMarketingEmail`.
 * - Solo con sesión; todo empieza apagado; guardar abre y cierra filas (historial).
 * - Baja con el token firmado: solo quita ese tema; token falso → 404; repetirla no falla.
 * - Un email comercial solo sale con el tema activo, con las cabeceras de baja de un clic.
 * - Baja de la cuenta: se borran sus consentimientos.
 */
jest.setTimeout(120 * 1000);

type Res = { status: number; data: Record<string, unknown> };
const asRes = (e: { response: Res }) => e.response;
type Topic = { id: string; granted: boolean; granted_at: string | null };
const granted = (topics: Topic[]) => topics.filter((t) => t.granted).map((t) => t.id);

medusaIntegrationTestRunner({
  env: {},
  testSuite: ({ api, getContainer }) => {
    let container: MedusaContainer;
    let headers: Record<string, string>;
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

    /** Cliente con email verificado (flujo de la fase 9) → cabeceras con su token e id. */
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
      const created = await api.post(
        "/store/customers",
        { email },
        { headers: { ...headers, authorization: `Bearer ${login.data.token}` } },
      );
      const relogin = await api.post("/auth/customer/emailpass", { email, password });
      return {
        id: (created.data.customer as { id: string }).id,
        auth: { headers: { ...headers, authorization: `Bearer ${relogin.data.token}` } },
      };
    };

    async function adminAuth() {
      const email = `admin-${Date.now()}@example.com`;
      const password = "Admin-123456";
      const user = await container.resolve(Modules.USER).createUsers({ email });
      const authModule = container.resolve(Modules.AUTH);
      const { authIdentity } = await authModule.register("emailpass", {
        body: { email, password },
      } as never);
      await authModule.updateAuthIdentities({
        id: authIdentity!.id,
        app_metadata: { user_id: user.id },
      });
      const login = await api.post("/auth/user/emailpass", { email, password });
      return { headers: { authorization: `Bearer ${login.data.token}` } };
    }

    it("401 sin sesión", async () => {
      const get = await api.get("/store/customers/me/comms", { headers }).catch(asRes);
      const post = await api
        .post("/store/customers/me/comms", { topics: [] }, { headers })
        .catch(asRes);
      expect([get.status, post.status]).toEqual([401, 401]);
    });

    it("todo apagado al principio; guardar abre y cierra (con historial)", async () => {
      const ana = await customerAuth("ana-comms@example.com");
      const first = await api.get("/store/customers/me/comms", ana.auth);
      expect((first.data.topics as Topic[]).map((t) => t.id)).toEqual([
        "novedades",
        "cumpleanos",
        "gincana",
      ]);
      expect(granted(first.data.topics as Topic[])).toEqual([]);

      const saved = await api.post(
        "/store/customers/me/comms",
        { topics: ["gincana", "novedades", "novedades"] },
        ana.auth,
      );
      expect(granted(saved.data.topics as Topic[])).toEqual(["novedades", "gincana"]);

      const changed = await api.post(
        "/store/customers/me/comms",
        { topics: ["cumpleanos", "novedades"] },
        ana.auth,
      );
      expect(granted(changed.data.topics as Topic[])).toEqual(["novedades", "cumpleanos"]);

      const bad = await api
        .post("/store/customers/me/comms", { topics: ["spam"] }, ana.auth)
        .catch(asRes);
      expect(bad.status).toBe(400);

      const admin = await adminAuth();
      const view = await api.get(`/admin/customers/${ana.id}/comms`, admin);
      expect(granted(view.data.topics as Topic[])).toEqual(["novedades", "cumpleanos"]);
      const history = view.data.history as { topic: string; revoked_via: string | null }[];
      expect(history).toHaveLength(3);
      expect(history.find((h) => h.topic === "gincana")?.revoked_via).toBe("cuenta");
    });

    it("baja con el token: solo ese tema; falso → 404; repetir no falla", async () => {
      const luis = await customerAuth("luis-comms@example.com");
      await api.post("/store/customers/me/comms", { topics: ["novedades", "gincana"] }, luis.auth);
      const token = unsubscribeToken({ customer_id: luis.id, topic: "novedades" });

      const info = await api.get("/store/comms/unsubscribe", { headers, params: { token } });
      expect(info.data.topic).toEqual({ id: "novedades", title: "Novedades y ofertas" });

      const fake = token.slice(0, -2) + (token.endsWith("A") ? "BB" : "AA");
      const bad = await api
        .post("/store/comms/unsubscribe", { token: fake }, { headers })
        .catch(asRes);
      expect(bad.status).toBe(404);
      const badGet = await api
        .get("/store/comms/unsubscribe", { headers, params: { token: fake } })
        .catch(asRes);
      expect(badGet.status).toBe(404);

      const done = await api.post("/store/comms/unsubscribe", { token }, { headers });
      expect(done.data.unsubscribed).toBe(true);
      const again = await api.post("/store/comms/unsubscribe", { token }, { headers });
      expect(again.status).toBe(200);

      const after = await api.get("/store/customers/me/comms", luis.auth);
      expect(granted(after.data.topics as Topic[])).toEqual(["gincana"]);
      const admin = await adminAuth();
      const view = await api.get(`/admin/customers/${luis.id}/comms`, admin);
      const history = view.data.history as { topic: string; revoked_via: string | null }[];
      expect(history.find((h) => h.topic === "novedades")?.revoked_via).toBe("baja");
    });

    it("email comercial: solo con el tema activo y con las cabeceras de baja", async () => {
      const eva = await customerAuth("eva-comms@example.com");
      const notifications = container.resolve(Modules.NOTIFICATION);
      const spy = jest.spyOn(notifications, "createNotifications").mockResolvedValue([] as never);
      const send = () =>
        sendMarketingEmail(container, {
          customerId: eva.id,
          topic: "novedades",
          to: "eva-comms@example.com",
          // Aún no hay plantillas comerciales (llegan en MK-D/MK-F): una cualquiera, con el
          // createNotifications simulado.
          template: "welcome" as never,
          data: {
            storefrontUrl: "https://tienda.es",
            assetsUrl: "https://tienda.es",
            accountUrl: "https://tienda.es/cuenta/",
          } as never,
          idempotencyKey: "mk-test/1",
        });

      expect(await send()).toBe(false);
      expect(spy).not.toHaveBeenCalled();

      await api.post("/store/customers/me/comms", { topics: ["novedades"] }, eva.auth);
      expect(await send()).toBe(true);
      const arg = spy.mock.calls[0]![0] as unknown as {
        data: { unsubscribe: { url: string; topic: string } };
        provider_data: { headers: Record<string, string> };
      };
      expect(arg.data.unsubscribe.topic).toBe("Novedades y ofertas");
      expect(arg.data.unsubscribe.url).toMatch(/\/baja\/\?t=cus_/);
      expect(arg.provider_data.headers).toEqual({
        "List-Unsubscribe": `<${arg.data.unsubscribe.url}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      });
    });

    it("baja de la cuenta: se borran sus consentimientos", async () => {
      const leo = await customerAuth("leo-comms@example.com");
      await api.post("/store/customers/me/comms", { topics: ["novedades"] }, leo.auth);
      await commsCustomerDeleted({
        event: { name: "customer.deleted", data: { id: leo.id } },
        container,
      } as Parameters<typeof commsCustomerDeleted>[0]);
      const svc = container.resolve<CommsModuleService>(COMMS_MODULE);
      expect(await svc.listCommsConsents({ customer_id: leo.id })).toEqual([]);
    });
  },
});
