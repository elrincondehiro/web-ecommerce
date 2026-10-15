import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  cancelOrderWorkflow,
  createShippingOptionsWorkflow,
  receiveAndCompleteReturnOrderWorkflow,
  createAndCompleteReturnOrderWorkflow,
  createOrderFulfillmentWorkflow,
  createProductsWorkflow,
} from "@medusajs/medusa/core-flows";
import seedStore, { PRODUCT_TYPE_IVA_REDUCIDO } from "../../src/scripts/seed";
import { accruePoints } from "../../src/lib/points-accrue";
import { deleteStalePointsPromotions } from "../../src/lib/stale-carts";
import { POINTS_MODULE } from "../../src/modules/points";
import type PointsModuleService from "../../src/modules/points/service";
import { POINTS_BALANCE_MESSAGE } from "../../src/workflows/hooks/validar-carrito";
import { pointsMovementWorkflow } from "../../src/workflows/points";

/**
 * Programa de puntos (Fase L-2). Sin Stripe: el seed usa `pp_system_default`.
 * - Canje como promoción (spike L-0): baja el IVA, tope por saldo y ≥ 0,50 € por pagar,
 *   sustituir, quitar, carrito ajeno; al hacer el pedido se carga el descuento REAL.
 * - Dos carritos con el mismo saldo: el segundo no se puede pagar (hook validate).
 * - Abono al consolidar (14 días desde el envío): 0,8 % con IVA sin envío, sin `sin_puntos`,
 *   sin la parte pagada con puntos; idempotente; cancelado o sin enviar → nada.
 * - Cancelación devuelve lo canjeado (una vez). Devolución tras el abono → cargo.
 * - Admin: ajuste con nota, informe (G3).
 * Las fechas de envío se retrasan con SQL directo SOLO en el test.
 */
jest.setTimeout(300 * 1000);

const DAY = 24 * 60 * 60 * 1000;
type Res = { status: number; data: Record<string, unknown> & { message?: string } };
const asRes = (e: { response: Res }) => e.response;

medusaIntegrationTestRunner({
  inApp: true,
  env: { STRIPE_API_KEY: "" },
  testSuite: ({ api, getContainer }) => {
    let container: MedusaContainer;
    let headers: Record<string, string>;
    let regionId: string;
    let channelId: string;
    let events: { name: string; data: Record<string, unknown> }[];
    let v21: string; // 30 € con IVA al 21 %
    let v10: string; // 70 € con IVA al 10 %
    let vNo: string; // 50 €, producto sin_puntos

    const query = () => container.resolve(ContainerRegistrationKeys.QUERY);
    const service = () => container.resolve<PointsModuleService>(POINTS_MODULE);
    const db = () => container.resolve(ContainerRegistrationKeys.PG_CONNECTION);

    beforeEach(async () => {
      container = getContainer();
      await seedStore({ container } as Parameters<typeof seedStore>[0]);
      const [key] = await container.resolve(Modules.API_KEY).listApiKeys({ type: "publishable" });
      headers = { "x-publishable-api-key": key!.token };
      const [region] = await container.resolve(Modules.REGION).listRegions({});
      regionId = region!.id;
      const [channel] = await container.resolve(Modules.SALES_CHANNEL).listSalesChannels({});
      channelId = channel!.id;
      const [type10] = await container
        .resolve(Modules.PRODUCT)
        .listProductTypes({ value: PRODUCT_TYPE_IVA_REDUCIDO });
      const [profile] = await container
        .resolve(Modules.FULFILLMENT)
        .listShippingProfiles({ type: "default" });
      const mk = (title: string, amount: number, extra: Record<string, unknown> = {}) => ({
        title,
        status: "published" as const,
        shipping_profile_id: profile!.id,
        sales_channels: [{ id: channelId }],
        options: [{ title: "Talla", values: ["Única"] }],
        variants: [
          {
            title: "Única",
            options: { Talla: "Única" },
            manage_inventory: false,
            prices: [{ currency_code: "eur", amount }],
          },
        ],
        ...extra,
      });
      const { result } = await createProductsWorkflow(container).run({
        input: {
          products: [
            mk("Collar", 30),
            mk("Pienso", 70, { type_id: type10!.id }),
            mk("Tarjeta", 50, { metadata: { sin_puntos: true } }),
          ],
        },
      });
      [v21, v10, vNo] = result.map((p) => p.variants[0]!.id);

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

    /** Cliente verificado (flujo de la fase 9) → cabeceras con token e id. */
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
        id: created.data.customer.id as string,
        auth: { headers: { ...headers, authorization: `Bearer ${relogin.data.token}` } },
      };
    };

    const credit = (customer_id: string, amount: number, reference_id = `seed-${amount}`) =>
      pointsMovementWorkflow(container).run({
        input: { customer_id, type: "credit", amount, reference: "adjustment", reference_id },
      });

    const newCart = async (
      auth: { headers: Record<string, string> },
      lines: [string, number][],
    ) => {
      const { cart } = (await api.post("/store/carts", { region_id: regionId }, auth)).data;
      for (const [variant_id, quantity] of lines) {
        await api.post(`/store/carts/${cart.id}/line-items`, { variant_id, quantity }, auth);
      }
      await api.post(
        `/store/carts/${cart.id}`,
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
        auth,
      );
      const opts = (await api.get(`/store/shipping-options?cart_id=${cart.id}`, auth)).data
        .shipping_options as { id: string; name: string }[];
      const std = opts.find((o) => o.name === "Envío estándar") ?? opts[0]!;
      await api.post(`/store/carts/${cart.id}/shipping-methods`, { option_id: std.id }, auth);
      return cart.id as string;
    };

    const cartTotals = async (id: string) => {
      const { data } = await query().graph({
        entity: "cart",
        fields: ["total", "tax_total", "discount_total", "payment_collection.amount"],
        filters: { id },
      });
      const c = data[0]!;
      return {
        total: Number(c.total),
        tax: Number(c.tax_total),
        discount: Number(c.discount_total),
      };
    };

    const pay = async (cartId: string, auth: { headers: Record<string, string> }) => {
      const pc = (await api.post("/store/payment-collections", { cart_id: cartId }, auth)).data
        .payment_collection;
      await api.post(
        `/store/payment-collections/${pc.id}/payment-sessions`,
        { provider_id: "pp_system_default" },
        auth,
      );
      return api.post(`/store/carts/${cartId}/complete`, {}, auth).catch(asRes);
    };

    /** Envía TODO el pedido y retrasa la fecha de envío `daysAgo` días. */
    const ship = async (orderId: string, daysAgo: number) => {
      const { data } = await query().graph({
        entity: "order",
        fields: ["total", "items.id", "items.quantity"],
        filters: { id: orderId },
      });
      const [loc] = await container.resolve(Modules.STOCK_LOCATION).listStockLocations({});
      const { result } = await createOrderFulfillmentWorkflow(container).run({
        input: {
          order_id: orderId,
          location_id: loc!.id,
          items: data[0]!.items!.map((i) => ({
            id: i!.id,
            quantity: Number(i!.quantity),
          })),
        },
      });
      await db()("fulfillment")
        .where({ id: result.id })
        .update({ shipped_at: new Date(Date.now() - daysAgo * DAY) });
    };

    const movements = async (customerId: string) => {
      const account = await service().findAccount(customerId);
      return account
        ? (
            await service().listPointsTransactions(
              { account_id: account.id },
              { select: ["type", "amount", "reference", "reference_id"] },
            )
          ).map((t) => ({
            type: t.type,
            amount: Number(t.amount),
            reference: t.reference,
            reference_id: t.reference_id,
          }))
        : [];
    };
    const balance = async (auth: { headers: Record<string, string> }) =>
      (await api.get("/store/customers/me/points", auth)).data.balance as number;

    it("canje: baja el IVA, topes, sustituir, quitar y carrito ajeno", async () => {
      const ana = await customer("ana@example.com");
      const luis = await customer("luis@example.com");
      await credit(ana.id, 10);
      expect(await balance(ana.auth)).toBe(10);

      const cartId = await newCart(ana.auth, [
        [v21, 1],
        [v10, 1],
      ]);
      const before = await cartTotals(cartId);
      expect(before.total).toBe(104.95); // 30 + 70 + 4,95

      const apply = (amount: number, auth = ana.auth) =>
        api.post(`/store/carts/${cartId}/points`, { amount }, auth).catch(asRes);
      // Más que el saldo, sin sesión, carrito ajeno
      expect((await apply(11)).status).toBe(400);
      expect(
        (await api.post(`/store/carts/${cartId}/points`, { amount: 1 }, { headers }).catch(asRes))
          .status,
      ).toBe(401);
      expect((await apply(1, luis.auth)).status).toBe(404);

      const ok = await apply(5);
      expect(ok.status).toBe(200);
      const after = await cartTotals(cartId);
      expect(after.total).toBe(99.95);
      expect(after.discount).toBe(5);
      expect(after.tax).toBeLessThan(before.tax); // el descuento reduce la base (G1)

      // L-3: GET para el checkout. Dueño: saldo, máximo y aplicado; invitado/ajeno: solo `earn`.
      // earn = 0,8 % de (100 − 5) = 0,76
      const info = await api.get(`/store/carts/${cartId}/points`, ana.auth);
      expect(info.data).toEqual({
        earn: 0.76,
        applied: 5,
        balance: 10,
        max: 10,
        code: null,
        code_amount: 0,
      });
      const anon = await api.get(`/store/carts/${cartId}/points`, { headers });
      expect(anon.data).toEqual({
        earn: 0.76,
        applied: 0,
        balance: null,
        max: null,
        code: null,
        code_amount: 0,
      });
      const other = await api.get(`/store/carts/${cartId}/points`, luis.auth);
      expect(other.data.balance).toBeNull();
      expect(
        (await api.get(`/store/carts/cart_NOEXISTE/points`, { headers }).catch(asRes)).status,
      ).toBe(404);

      // Sustituir: 3 € (una sola promoción de puntos en el carrito)
      await apply(3);
      expect((await cartTotals(cartId)).total).toBe(101.95);
      const { data } = await query().graph({
        entity: "cart",
        fields: ["promotions.code"],
        filters: { id: cartId },
      });
      expect(data[0]!.promotions!.filter((p) => p!.code!.startsWith("PTS-"))).toHaveLength(1);

      // Quitar
      await api.delete(`/store/carts/${cartId}/points`, ana.auth);
      expect((await cartTotals(cartId)).total).toBe(104.95);
    });

    it("tope de 0,50 € por pagar: sin envío caro, no se puede canjear todo", async () => {
      const ana = await customer("tope@example.com");
      await credit(ana.id, 100);
      const cartId = await newCart(ana.auth, [[v21, 1]]); // 30 € + 4,95 envío
      // El envío ya cubre los 0,50 €: se pueden usar los 30 € de productos
      expect(
        (await api.post(`/store/carts/${cartId}/points`, { amount: 30 }, ana.auth)).status,
      ).toBe(200);
      expect((await cartTotals(cartId)).total).toBe(4.95);
      const over = await api
        .post(`/store/carts/${cartId}/points`, { amount: 30.01 }, ana.auth)
        .catch(asRes);
      expect(over.status).toBe(400);
      expect(over.data.message).toMatch(/como máximo 30,00 €/);
    });

    it("pedido: se carga el descuento real; el segundo carrito con el mismo saldo falla", async () => {
      const ana = await customer("pedido@example.com");
      await credit(ana.id, 5);
      const a = await newCart(ana.auth, [[v21, 1]]);
      const b = await newCart(ana.auth, [[v21, 1]]);
      await api.post(`/store/carts/${a}/points`, { amount: 5 }, ana.auth);
      await api.post(`/store/carts/${b}/points`, { amount: 5 }, ana.auth);

      const done = await pay(a, ana.auth);
      expect(done.status).toBe(200);
      const orderId = (done.data as { order: { id: string } }).order.id;
      for (let i = 0; i < 50 && (await balance(ana.auth)) !== 0; i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      expect(await balance(ana.auth)).toBe(0);
      expect(await movements(ana.id)).toContainEqual({
        type: "debit",
        amount: 5,
        reference: "order_redeem",
        reference_id: orderId,
      });

      const second = await pay(b, ana.auth);
      expect(second.status).toBe(400);
      expect(second.data.message).toBe(POINTS_BALANCE_MESSAGE);

      // Limpieza (job de carritos): la promoción usada se queda; la del carrito b (sin usar) se
      // borra cuando el carrito lleva inactivo más del corte.
      const promotions = container.resolve(Modules.PROMOTION);
      const list = async () =>
        (await promotions.listPromotions({ code: { $like: "PTS-%" } } as never)).length;
      expect(await list()).toBe(2);
      expect(await deleteStalePointsPromotions(container, new Date(Date.now() - DAY))).toBe(0);
      expect(await deleteStalePointsPromotions(container, new Date(Date.now() + DAY))).toBe(1);
      expect(await list()).toBe(1);
    });

    it("abono al consolidar: 0,8 % con IVA, sin envío ni sin_puntos ni lo canjeado; idempotente", async () => {
      const ana = await customer("abono@example.com");
      await credit(ana.id, 10);
      const cartId = await newCart(ana.auth, [
        [v21, 1],
        [v10, 1],
        [vNo, 1],
      ]);
      await api.post(`/store/carts/${cartId}/points`, { amount: 10 }, ana.auth);
      const done = await pay(cartId, ana.auth);
      const orderId = (done.data as { order: { id: string } }).order.id;
      const pending = await api.get("/store/customers/me/points", ana.auth);
      // Base: (30 + 70 + 50 − 10) con el descuento repartido; sin la línea sin_puntos.
      expect(pending.data.pending).toBeGreaterThan(0);

      // Enviado hace 13 días → aún no
      await ship(orderId, 13);
      expect((await accruePoints(container)).credited).toBe(0);
      await db()("fulfillment").update({ shipped_at: new Date(Date.now() - 14 * DAY - 1000) });
      expect((await accruePoints(container)).credited).toBe(1);
      expect((await accruePoints(container)).credited).toBe(0); // idempotente

      const accrued = (await movements(ana.id)).find((m) => m.reference === "order")!;
      // Líneas con puntos: 30 + 70 = 100 menos su parte del descuento de 10 € (repartido entre
      // 150 € de productos: 100/150 × 10 = 6,67) → 93,33 € × 0,8 % = 0,74.
      expect(accrued).toEqual({
        type: "credit",
        amount: 0.74,
        reference: "order",
        reference_id: orderId,
      });
      expect((await api.get("/store/customers/me/points", ana.auth)).data.pending).toBe(0);
    });

    it("cancelar devuelve lo canjeado (una vez) y no abona; devolución tras el abono descuenta", async () => {
      const ana = await customer("cancela@example.com");
      await credit(ana.id, 4);
      const c1 = await newCart(ana.auth, [[v21, 1]]);
      await api.post(`/store/carts/${c1}/points`, { amount: 4 }, ana.auth);
      const o1 = ((await pay(c1, ana.auth)).data as { order: { id: string } }).order.id;
      for (let i = 0; i < 50 && (await balance(ana.auth)) !== 0; i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      const n = events.length;
      await cancelOrderWorkflow(container).run({ input: { order_id: o1 } });
      await waitEvent("order.canceled", n);
      for (let i = 0; i < 50 && (await balance(ana.auth)) !== 4; i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      expect(await balance(ana.auth)).toBe(4);
      expect((await accruePoints(container)).credited).toBe(0);
      // Evento repetido (reintento): no se devuelve dos veces.
      await container.resolve(Modules.EVENT_BUS).emit({ name: "order.canceled", data: { id: o1 } });
      await new Promise((r) => setTimeout(r, 1000));
      expect(await balance(ana.auth)).toBe(4);

      // Pedido de 100 € (sin puntos) consolidado → 0,80; devolución de 70 € → −0,56
      const c2 = await newCart(ana.auth, [
        [v21, 1],
        [v10, 1],
      ]);
      const o2 = ((await pay(c2, ana.auth)).data as { order: { id: string } }).order.id;
      await ship(o2, 15);
      await accruePoints(container);
      expect(await balance(ana.auth)).toBe(4.8);
      const { data } = await query().graph({
        entity: "order",
        fields: ["items.id", "items.variant_id"],
        filters: { id: o2 },
      });
      const line = data[0]!.items!.find((i) => i!.variant_id === v10)!;
      // El seed no tiene opción de devolución: una de 0 € solo para el test.
      const fulfillment = container.resolve(Modules.FULFILLMENT);
      const [zone] = await fulfillment.listServiceZones({});
      const [profile] = await fulfillment.listShippingProfiles({ type: "default" });
      const {
        result: [returnOption],
      } = await createShippingOptionsWorkflow(container).run({
        input: [
          {
            name: "Devolución",
            price_type: "flat",
            provider_id: "manual_manual",
            service_zone_id: zone!.id,
            shipping_profile_id: profile!.id,
            type: { label: "Devolución", description: "Devolución", code: "return" },
            prices: [{ region_id: regionId, amount: 0 }],
            rules: [
              { attribute: "enabled_in_store", value: "true", operator: "eq" },
              { attribute: "is_return", value: "true", operator: "eq" },
            ],
          },
        ],
      });
      const [loc] = await container.resolve(Modules.STOCK_LOCATION).listStockLocations({});
      const m = events.length;
      // En dos pasos: con `receive_now`, core-flows 2.21.2 recibe TODAS las líneas del pedido.
      const { result: ret } = await createAndCompleteReturnOrderWorkflow(container).run({
        input: {
          order_id: o2,
          items: [{ id: line.id, quantity: 1 }],
          return_shipping: { option_id: returnOption!.id, price: 0 },
          location_id: loc!.id,
        },
      });
      await receiveAndCompleteReturnOrderWorkflow(container).run({
        input: { return_id: ret.id, items: [{ id: line.id, quantity: 1 }] },
      });
      // Este workflow no emite el evento (lo emite el flujo del Admin, confirm-receive-return-
      // request, con este mismo payload): se emite aquí para probar el subscriber.
      await container
        .resolve(Modules.EVENT_BUS)
        .emit({ name: "order.return_received", data: { order_id: o2, return_id: ret.id } });
      await waitEvent("order.return_received", m);

      for (let i = 0; i < 50 && (await balance(ana.auth)) !== 4.24; i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      expect(await balance(ana.auth)).toBe(4.24);
      // La misma devolución otra vez: idempotente.
      await container
        .resolve(Modules.EVENT_BUS)
        .emit({ name: "order.return_received", data: { order_id: o2, return_id: ret.id } });
      await new Promise((r) => setTimeout(r, 1000));
      expect(await balance(ana.auth)).toBe(4.24);
    });

    it("admin: ajuste con nota (cargo recortado al saldo) e informe", async () => {
      const ana = await customer("admin@example.com");
      await credit(ana.id, 2);
      const { token } = await adminLogin();
      const admin = { headers: { authorization: `Bearer ${token}` } };
      const bad = await api
        .post(`/admin/customers/${ana.id}/points`, { type: "credit", amount: 1 }, admin)
        .catch(asRes);
      expect(bad.status).toBe(400); // falta la nota
      const up = await api.post(
        `/admin/customers/${ana.id}/points`,
        { type: "credit", amount: 1.5, note: "Compensación por retraso" },
        admin,
      );
      expect(up.data.balance).toBe(3.5);
      const down = await api.post(
        `/admin/customers/${ana.id}/points`,
        { type: "debit", amount: 10, note: "Error de abono" },
        admin,
      );
      expect(down.data.balance).toBe(0);
      const report = await api.get("/admin/points/report", admin);
      expect(report.data).toMatchObject({ outstanding: 0, accounts_with_balance: 0 });
      expect((await api.get(`/admin/customers/${ana.id}/points`, admin)).data.count).toBe(3);
      expect((await api.get("/admin/points/report", { headers }).catch(asRes)).status).toBe(401);
    });

    /** Usuario del Admin (seed de test): crea uno y devuelve su token. */
    async function adminLogin() {
      const email = `admin-${Date.now()}@example.com`;
      const password = "Admin-123456";
      const authModule = container.resolve(Modules.AUTH);
      const userModule = container.resolve(Modules.USER);
      const user = await userModule.createUsers({ email });
      const { authIdentity } = await authModule.register("emailpass", {
        body: { email, password },
      } as never);
      await authModule.updateAuthIdentities({
        id: authIdentity!.id,
        app_metadata: { user_id: user.id },
      });
      const login = await api.post("/auth/user/emailpass", { email, password });
      return { token: login.data.token as string };
    }
  },
});
