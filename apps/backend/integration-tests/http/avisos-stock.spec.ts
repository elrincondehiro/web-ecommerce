import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  createInventoryLevelsWorkflow,
  createProductsWorkflow,
  updateInventoryLevelsWorkflow,
} from "@medusajs/medusa/core-flows";
import seedStore from "../../src/scripts/seed";
import { STOCK_ALERTS_FULFILLED } from "../../src/lib/stock-alerts";
import { checkStockAlerts, expireStockAlerts } from "../../src/lib/stock-alerts-jobs";
import { STOCK_ALERT_MODULE } from "../../src/modules/stock-alert";
import type StockAlertModuleService from "../../src/modules/stock-alert/service";
import stockAlertsEmail from "../../src/subscribers/stock-alerts-email";
import stockAlertsCustomerDeleted from "../../src/subscribers/stock-alerts-customer-deleted";
import type { StockAlertsFulfilledData } from "../../src/workflows/stock-alerts";

/**
 * Avisos de stock (Fase MK-B): `/store/customers/me/stock-alerts*`, `/admin/stock-alerts`,
 * `/admin/products/:id/stock-alerts`, el job de detección (con «puede agotarse pronto»), el email,
 * la caducidad y el borrado con el cliente.
 */
jest.setTimeout(180 * 1000);

type Res = { status: number; data: Record<string, unknown> };
const asRes = (e: { response: Res }) => e.response;

medusaIntegrationTestRunner({
  env: {},
  testSuite: ({ api, getContainer }) => {
    let container: MedusaContainer;
    let headers: Record<string, string>;
    let events: { name: string; data: Record<string, unknown> }[];
    let productId: string;
    let variants: { id: string; title: string; item: string }[];
    let locationId: string;

    const svc = () => container.resolve<StockAlertModuleService>(STOCK_ALERT_MODULE);

    beforeEach(async () => {
      container = getContainer();
      await seedStore({ container } as Parameters<typeof seedStore>[0]);
      const [key] = await container.resolve(Modules.API_KEY).listApiKeys({ type: "publishable" });
      headers = { "x-publishable-api-key": key!.token };
      const [channel] = await container.resolve(Modules.SALES_CHANNEL).listSalesChannels({});
      const [profile] = await container
        .resolve(Modules.FULFILLMENT)
        .listShippingProfiles({ type: "default" });
      const [location] = await container.resolve(Modules.STOCK_LOCATION).listStockLocations({});
      locationId = location!.id;
      const { result } = await createProductsWorkflow(container).run({
        input: {
          products: [
            {
              title: "Arnés",
              status: "published",
              shipping_profile_id: profile!.id,
              sales_channels: [{ id: channel!.id }],
              options: [{ title: "Talla", values: ["S", "M"] }],
              variants: ["S", "M"].map((t) => ({
                title: t,
                sku: `ARN-${t}`,
                options: { Talla: t },
                manage_inventory: true,
                prices: [{ currency_code: "eur", amount: 20 }],
              })),
            },
          ],
        },
      });
      productId = result[0]!.id;
      const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
        entity: "product_variant",
        fields: ["id", "title", "inventory_items.inventory_item_id"],
        filters: { product_id: productId },
      });
      variants = (
        data as { id: string; title: string; inventory_items: { inventory_item_id: string }[] }[]
      )
        .map((v) => ({ id: v.id, title: v.title, item: v.inventory_items[0]!.inventory_item_id }))
        .sort((a, b) => a.title.localeCompare(b.title));
      // S con 1 unidad; M agotada (0).
      await createInventoryLevelsWorkflow(container).run({
        input: {
          inventory_levels: variants.map((v) => ({
            inventory_item_id: v.item,
            location_id: locationId,
            stocked_quantity: v.title === "S" ? 1 : 0,
          })),
        },
      });

      events = [];
      const eventBus = container.resolve(Modules.EVENT_BUS);
      const emit = eventBus.emit.bind(eventBus);
      jest.spyOn(eventBus, "emit").mockImplementation(async (d, options) => {
        for (const m of Array.isArray(d) ? d : [d]) {
          events.push({ name: m.name, data: m.data as Record<string, unknown> });
        }
        return emit(d, options);
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
      delete process.env.EMAIL_TRANSPORT;
    });

    const waitEvent = async (name: string, after = 0) => {
      for (let i = 0; i < 50; i++) {
        const found = events.slice(after).find((e) => e.name === name);
        if (found) return found.data;
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error(`No se emitió ${name}`);
    };

    const customer = async (email: string) => {
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

    const setStock = async (title: string, qty: number) => {
      const v = variants.find((x) => x.title === title)!;
      await updateInventoryLevelsWorkflow(container).run({
        input: {
          updates: [{ inventory_item_id: v.item, location_id: locationId, stocked_quantity: qty }],
        },
      });
    };
    const M = () => variants.find((v) => v.title === "M")!.id;
    const S = () => variants.find((v) => v.title === "S")!.id;

    it("401 sin sesión; crear (idempotente), listar y quitar; con stock o ajeno → no", async () => {
      const anon = await api
        .post(
          "/store/customers/me/stock-alerts",
          { product_id: productId, variant_id: M() },
          { headers },
        )
        .catch(asRes);
      expect(anon.status).toBe(401);

      const ana = await customer("ana-stock@example.com");
      const body = { product_id: productId, variant_id: M() };
      const created = await api.post("/store/customers/me/stock-alerts", body, ana.auth);
      expect(created.status).toBe(201);
      const again = await api.post("/store/customers/me/stock-alerts", body, ana.auth);
      expect([again.status, again.data.created]).toEqual([200, false]);

      const inStock = await api
        .post(
          "/store/customers/me/stock-alerts",
          { product_id: productId, variant_id: S() },
          ana.auth,
        )
        .catch(asRes);
      expect(inStock.status).toBe(400);
      const wrongProduct = await api
        .post(
          "/store/customers/me/stock-alerts",
          { product_id: "prod_01XXXXXXXX", variant_id: M() },
          ana.auth,
        )
        .catch(asRes);
      expect(wrongProduct.status).toBe(404);

      const list = await api.get("/store/customers/me/stock-alerts", ana.auth);
      const alerts = list.data.alerts as { id: string; variant_id: string }[];
      expect(alerts.map((a) => a.variant_id)).toEqual([M()]);

      const luis = await customer("luis-stock@example.com");
      const foreign = await api.delete(
        `/store/customers/me/stock-alerts/${alerts[0]!.id}`,
        luis.auth,
      );
      expect(foreign.data.deleted).toBe(false);
      const removed = await api.delete(
        `/store/customers/me/stock-alerts/${alerts[0]!.id}`,
        ana.auth,
      );
      expect(removed.data.deleted).toBe(true);
      expect((await api.get("/store/customers/me/stock-alerts", ana.auth)).data.alerts).toEqual([]);
    });

    it("lista de espera en el Admin; al reponer: un evento por cliente y «puede agotarse pronto»", async () => {
      const ana = await customer("ana2-stock@example.com");
      const eva = await customer("eva2-stock@example.com");
      const body = { product_id: productId, variant_id: M() };
      await api.post("/store/customers/me/stock-alerts", body, ana.auth);
      await api.post("/store/customers/me/stock-alerts", body, eva.auth);

      const admin = await adminAuth();
      const all = await api.get("/admin/stock-alerts", admin);
      expect(all.data.customers).toBe(2);
      expect((all.data.rows as Record<string, unknown>[])[0]).toMatchObject({
        variant_id: M(),
        product_title: "Arnés",
        variant_title: "M",
        sku: "ARN-M",
        waiting: 2,
        available: 0,
      });
      const one = await api.get(`/admin/products/${productId}/stock-alerts`, admin);
      expect((one.data.rows as unknown[]).length).toBe(1);

      // Sin stock: nada
      expect((await checkStockAlerts(container)).fulfilled).toBe(0);

      // Se reponen 2 para 2 que esperan → «puede agotarse pronto»
      await setStock("M", 2);
      const before = events.length;
      expect((await checkStockAlerts(container)).fulfilled).toBe(2);
      const fulfilled = events
        .slice(before)
        .filter((e) => e.name === STOCK_ALERTS_FULFILLED)
        .map((e) => e.data as unknown as StockAlertsFulfilledData);
      expect(fulfilled.map((f) => f.customer_id).sort()).toEqual([ana.id, eva.id].sort());
      expect(fulfilled.every((f) => f.alerts[0]!.may_run_out)).toBe(true);
      // Marcados: la siguiente pasada no los repite
      expect((await checkStockAlerts(container)).fulfilled).toBe(0);

      // El email (subscriber, aquí a mano): una notificación y se borra el aviso
      process.env.EMAIL_TRANSPORT = "smtp";
      const notifications = container.resolve(Modules.NOTIFICATION);
      const sent: { template: string; data: Record<string, unknown> }[] = [];
      jest.spyOn(notifications, "createNotifications").mockImplementation((async (n: never) => {
        sent.push(n);
        return [];
      }) as never);
      const first = fulfilled[0]!;
      await stockAlertsEmail({
        event: { name: STOCK_ALERTS_FULFILLED, data: first },
        container,
      } as Parameters<typeof stockAlertsEmail>[0]);
      expect(sent).toHaveLength(1);
      expect(sent[0]!.template).toBe("stock-back");
      expect(sent[0]!.data.items).toEqual([
        expect.objectContaining({ title: "Arnés", variant: "M", mayRunOut: true }),
      ]);
      expect(await svc().listStockAlerts({ id: first.alerts[0]!.id })).toEqual([]);
    });

    it("hay de sobra para los que esperan → sin «puede agotarse pronto»", async () => {
      const ana = await customer("ana3-stock@example.com");
      await api.post(
        "/store/customers/me/stock-alerts",
        { product_id: productId, variant_id: M() },
        ana.auth,
      );
      await setStock("M", 5);
      const before = events.length;
      await checkStockAlerts(container);
      const data = events.slice(before).find((e) => e.name === STOCK_ALERTS_FULFILLED)!
        .data as unknown as StockAlertsFulfilledData;
      expect(data.alerts[0]!.may_run_out).toBe(false);
    });

    it("caducidad (STOCK_ALERT_TTL_DAYS) y baja de la cuenta", async () => {
      const ana = await customer("ana4-stock@example.com");
      await api.post(
        "/store/customers/me/stock-alerts",
        { product_id: productId, variant_id: M() },
        ana.auth,
      );
      // 181 días después con el valor por defecto (180) → caduca
      const later = new Date(Date.now() + 181 * 24 * 60 * 60 * 1000);
      process.env.STOCK_ALERT_TTL_DAYS = "365";
      expect((await expireStockAlerts(container, later)).expired).toBe(0);
      delete process.env.STOCK_ALERT_TTL_DAYS;
      expect((await expireStockAlerts(container, later)).expired).toBe(1);

      const eva = await customer("eva4-stock@example.com");
      await api.post(
        "/store/customers/me/stock-alerts",
        { product_id: productId, variant_id: M() },
        eva.auth,
      );
      await stockAlertsCustomerDeleted({
        event: { name: "customer.deleted", data: { id: eva.id } },
        container,
      } as Parameters<typeof stockAlertsCustomerDeleted>[0]);
      expect(await svc().listStockAlerts({ customer_id: eva.id })).toEqual([]);
    });
  },
});
