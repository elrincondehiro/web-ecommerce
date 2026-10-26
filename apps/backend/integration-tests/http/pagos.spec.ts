import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { createProductsWorkflow } from "@medusajs/medusa/core-flows";
import seedStore from "../../src/scripts/seed";
import { stripeSessionData } from "../../src/lib/stripe-session";
import { processTransferOrders } from "../../src/lib/transfer-orders";

/**
 * Pagos (Fase PG): `POST /store/payment-collections/:id/payment-sessions`.
 * - Para Stripe (`pp_stripe_stripe`) el servidor impone métodos y captura mixta y descarta lo que
 *   mande el navegador en `data` (middleware, src/lib/stripe-session.ts).
 * - Otros proveedores (pago manual) no se tocan.
 * Con una clave de Stripe FALSA (nunca llama a Stripe): el seed pone `pp_stripe_stripe` en la
 * región y se espía `createSession` del servicio de proveedores, que recibe los `data` que el
 * proveedor de Medusa pasa tal cual a Stripe (probado en PG-0); el espía corta ahí.
 */
jest.setTimeout(120 * 1000);

type Res = { status: number; data: { message?: string } };
const asRes = (e: { response: Res }) => e.response;

/**
 * Variables del test. Además de `env`, se ponen en `process.env` al cargar el fichero: con
 * @medusajs/test-utils 2.22 (sin `inApp`) `medusa-config.ts` se carga ANTES de aplicar `env`, y
 * sin `STRIPE_API_KEY` en ese momento el proveedor de Stripe no se registra (el seed lo pide y
 * falla). Jest da a cada fichero de test su propio `process.env`.
 */
const ENV = {
  STRIPE_API_KEY: "sk_test_falsa_pg",
  STRIPE_WEBHOOK_SECRET: "whsec_falso_pg",
  // Transferencia (PG-3): con IBAN y titular el seed añade el pago manual a la región.
  TRANSFER_IBAN: "ES91 2100 0418 4502 0005 1332",
  TRANSFER_HOLDER: "Tienda de Pruebas",
  TRANSFER_DAYS: "3",
};
Object.assign(process.env, ENV);

medusaIntegrationTestRunner({
  env: ENV,
  testSuite: ({ api, getContainer }) => {
    let container: MedusaContainer;
    let headers: Record<string, string>;
    let collectionId: string;
    let cartId: string;
    let regionId: string;
    let variantId: string;
    let events: string[][];

    beforeEach(async () => {
      container = getContainer();
      await seedStore({ container } as Parameters<typeof seedStore>[0]);
      const [key] = await container.resolve(Modules.API_KEY).listApiKeys({ type: "publishable" });
      headers = { "x-publishable-api-key": key!.token };
      const [region] = await container.resolve(Modules.REGION).listRegions({});
      regionId = region!.id;
      events = [];
      const eventBus = container.resolve(Modules.EVENT_BUS);
      const emit = eventBus.emit.bind(eventBus);
      jest.spyOn(eventBus, "emit").mockImplementation(async (data, options) => {
        for (const m of Array.isArray(data) ? data : [data]) {
          events.push([m.name, JSON.stringify(m.data)]);
        }
        return emit(data, options);
      });
      const [channel] = await container.resolve(Modules.SALES_CHANNEL).listSalesChannels({});
      const [profile] = await container
        .resolve(Modules.FULFILLMENT)
        .listShippingProfiles({ type: "default" });
      const { result } = await createProductsWorkflow(container).run({
        input: {
          products: [
            {
              title: "Collar",
              status: "published",
              shipping_profile_id: profile!.id,
              sales_channels: [{ id: channel!.id }],
              options: [{ title: "Talla", values: ["Única"] }],
              variants: [
                {
                  title: "Única",
                  options: { Talla: "Única" },
                  manage_inventory: false,
                  prices: [{ currency_code: "eur", amount: 20 }],
                },
              ],
            },
          ],
        },
      });
      variantId = result[0]!.variants[0]!.id;
      const { cart } = (await api.post("/store/carts", { region_id: region!.id }, { headers }))
        .data;
      cartId = cart.id;
      await api.post(
        `/store/carts/${cart.id}/line-items`,
        { variant_id: result[0]!.variants[0]!.id, quantity: 1 },
        { headers },
      );
      collectionId = (
        await api.post("/store/payment-collections", { cart_id: cart.id }, { headers })
      ).data.payment_collection.id;
    });

    afterEach(() => jest.restoreAllMocks());

    /** Lo que el proveedor recibiría para Stripe (se corta antes de llamar a Stripe). */
    const spySession = () => {
      const calls: { provider_id: string; data: unknown }[] = [];
      const payments = container.resolve(Modules.PAYMENT) as unknown as {
        paymentProviderService_: {
          createSession: (id: string, input: unknown) => Promise<unknown>;
        };
      };
      jest
        .spyOn(payments.paymentProviderService_, "createSession")
        .mockImplementation(async (provider_id, input) => {
          calls.push({ provider_id, data: (input as { data?: unknown }).data });
          throw new Error("detenido en el test");
        });
      return calls;
    };

    it("Stripe: métodos y captura mixta del servidor; lo del navegador se descarta", async () => {
      const calls = spySession();
      await api
        .post(
          `/store/payment-collections/${collectionId}/payment-sessions`,
          {
            provider_id: "pp_stripe_stripe",
            data: {
              capture_method: "manual",
              payment_method_types: ["klarna"],
              setup_future_usage: "off_session",
            },
          },
          { headers },
        )
        .catch(() => null);
      expect(calls).toHaveLength(1);
      // Medusa añade `session_id` (lo guarda en la metadata del PaymentIntent).
      const { session_id, ...data } = calls[0]!.data as Record<string, unknown>;
      expect(session_id).toMatch(/^payses_/);
      expect(data).toEqual(stripeSessionData());
      expect(data).toEqual({
        payment_method_types: ["card", "paypal", "bizum"],
        capture_method: "automatic",
        payment_method_options: {
          card: { capture_method: "manual" },
          paypal: { capture_method: "manual" },
        },
      });
    });

    it("sin data también se imponen", async () => {
      const calls = spySession();
      await api
        .post(
          `/store/payment-collections/${collectionId}/payment-sessions`,
          { provider_id: "pp_stripe_stripe" },
          { headers },
        )
        .catch(() => null);
      expect(calls[0]!.data).toEqual({ ...stripeSessionData(), session_id: expect.any(String) });
    });

    it("otro proveedor: no se toca", async () => {
      const calls = spySession();
      await api
        .post(
          `/store/payment-collections/${collectionId}/payment-sessions`,
          { provider_id: "pp_system_default", data: { nota: "x" } },
          { headers },
        )
        .catch(() => null);
      // El pago manual no está en la región con Stripe: no llega al proveedor, y nunca con datos de Stripe.
      for (const c of calls) expect(c.data).not.toHaveProperty("payment_method_types");
    });

    // ── Transferencia (PG-3) ──────────────────────────────────────────────────────────────
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
      let code = "";
      for (let i = 0; i < 50 && !code; i++) {
        const e = events.slice(before).find(([n]) => n === "auth.verification_requested");
        if (e) code = JSON.parse(e[1]!).code;
        else await new Promise((r) => setTimeout(r, 100));
      }
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

    /** Carrito del cliente con dirección y envío, listo para pagar. */
    const readyCart = async (auth: { headers: Record<string, string> }, email: string) => {
      const { cart } = (await api.post("/store/carts", { region_id: regionId }, auth)).data;
      await api.post(
        `/store/carts/${cart.id}/line-items`,
        { variant_id: variantId, quantity: 1 },
        auth,
      );
      const address = {
        first_name: "Ana",
        last_name: "López",
        address_1: "Calle Mayor 1",
        city: "Madrid",
        postal_code: "28001",
        country_code: "es",
      };
      await api.post(
        `/store/carts/${cart.id}`,
        { email, shipping_address: address, billing_address: address },
        auth,
      );
      const opts = (await api.get(`/store/shipping-options?cart_id=${cart.id}`, auth)).data
        .shipping_options as { id: string }[];
      await api.post(`/store/carts/${cart.id}/shipping-methods`, { option_id: opts[0]!.id }, auth);
      const pc = (await api.post("/store/payment-collections", { cart_id: cart.id }, auth)).data
        .payment_collection;
      return { cartId: cart.id as string, collectionId: pc.id as string };
    };

    it("transferencia: los invitados no pueden (sesión y disponibilidad)", async () => {
      const res = await api
        .post(
          `/store/payment-collections/${collectionId}/payment-sessions`,
          { provider_id: "pp_system_default" },
          { headers },
        )
        .catch(asRes);
      expect(res.status).toBe(400);
      expect(res.data.message).toMatch(/solo está disponible para clientes con cuenta/);
      const info = await api.get("/store/customers/me/transfer", { headers }).catch(asRes);
      expect(info.status).toBe(401);
      expect(cartId).toMatch(/^cart_/);
    });

    it("transferencia con cuenta: pedido pendiente, datos para pagar, recordatorio y cancelación", async () => {
      const email = "transfer@example.com";
      const auth = await customerAuth(email);
      expect((await api.get("/store/customers/me/transfer", auth)).data).toEqual({
        enabled: true,
        holder: "Tienda de Pruebas",
        days: 3,
      });
      const ready = await readyCart(auth, email);
      await api.post(
        `/store/payment-collections/${ready.collectionId}/payment-sessions`,
        { provider_id: "pp_system_default" },
        auth,
      );
      const done = await api.post(`/store/carts/${ready.cartId}/complete`, {}, auth);
      expect(done.data.type).toBe("order");
      const order = done.data.order as { id: string; display_id: number; created_at: string };

      const { transfer } = (await api.get(`/store/customers/me/orders/${order.id}/transfer`, auth))
        .data;
      expect(transfer).toMatchObject({
        iban: "ES91 2100 0418 4502 0005 1332",
        holder: "Tienda de Pruebas",
        concept: `Pedido ${order.display_id}`,
      });
      expect(transfer.amount).toMatch(/€/);
      // Otro cliente no lo ve.
      const other = await customerAuth("otro-transfer@example.com");
      const notMine = await api
        .get(`/store/customers/me/orders/${order.id}/transfer`, other)
        .catch(asRes);
      expect(notMine.status).toBe(404);

      // Job: antes del último día nada; el último día recordatorio; después, cancelación.
      const created = new Date(order.created_at).getTime();
      const day = 24 * 60 * 60 * 1000;
      expect(await processTransferOrders(container, new Date(created + day))).toEqual({
        reminded: 0,
        canceled: 0,
      });
      expect(await processTransferOrders(container, new Date(created + 3 * day))).toEqual({
        reminded: 1,
        canceled: 0,
      });
      expect(await processTransferOrders(container, new Date(created + 4 * day))).toEqual({
        reminded: 0,
        canceled: 1,
      });
      const [canceled] = await container
        .resolve(Modules.ORDER)
        .listOrders({ id: order.id }, { select: ["id", "status"] });
      expect(canceled!.status).toBe("canceled");
      expect(
        (await api.get(`/store/customers/me/orders/${order.id}/transfer`, auth)).data.transfer,
      ).toBeNull();
      // Ya cancelado: el job no lo vuelve a tocar.
      expect(await processTransferOrders(container, new Date(created + 5 * day))).toEqual({
        reminded: 0,
        canceled: 0,
      });
    });

    it("transferencia pagada (capturada en el Admin): el job no la cancela", async () => {
      const email = "transfer-pagada@example.com";
      const auth = await customerAuth(email);
      const ready = await readyCart(auth, email);
      await api.post(
        `/store/payment-collections/${ready.collectionId}/payment-sessions`,
        { provider_id: "pp_system_default" },
        auth,
      );
      const order = (await api.post(`/store/carts/${ready.cartId}/complete`, {}, auth)).data
        .order as { id: string; created_at: string };
      const payments = container.resolve(Modules.PAYMENT);
      const [payment] = await payments.listPayments({
        payment_session_id: (
          await payments.listPaymentSessions({ payment_collection_id: ready.collectionId })
        ).map((ps) => ps.id),
      });
      await payments.capturePayment({ payment_id: payment!.id });
      const later = new Date(new Date(order.created_at).getTime() + 10 * 24 * 60 * 60 * 1000);
      expect(await processTransferOrders(container, later)).toEqual({ reminded: 0, canceled: 0 });
    });
  },
});
