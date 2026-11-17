import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import type { ICartModuleService, MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { createProductsWorkflow } from "@medusajs/medusa/core-flows";
import seedStore from "../../src/scripts/seed";
import { anonymizedEmail } from "../../src/lib/account-deletion";
import { deleteStaleCarts } from "../../src/lib/stale-carts";
import { purgeDeleted } from "../../src/lib/purge";

/**
 * Limpieza de carritos y purga (fase 13 punto 4, docs/fases/fase13-cuenta.md):
 * - carrito de invitado con email (cliente sin cuenta) y sesión de pago: se borran la sesión y el
 *   carrito; la ficha del cliente, sin pedidos ni carritos, queda anonimizada y borrada;
 * - carrito de un cliente con cuenta: a los CART_EMPTY_DAYS se vacía (el carrito se queda);
 * - purga: lo borrado hace más de PURGE_DAYS desaparece de la BD.
 * Las fechas se retrasan con SQL directo SOLO en el test. Pago con `pp_system_default` (seed sin
 * Stripe): Stripe cancela el PaymentIntent al borrar la sesión (@medusajs/payment-stripe 2.22.7).
 */
jest.setTimeout(300 * 1000);

const DAY = 24 * 60 * 60 * 1000;
type Auth = { headers: Record<string, string> };

medusaIntegrationTestRunner({
  env: { STRIPE_API_KEY: "" },
  testSuite: ({ api, getContainer }) => {
    let container: MedusaContainer;
    let cartModule: ICartModuleService;
    let headers: Record<string, string>;
    let regionId: string;
    let variantId: string;
    let events: { name: string; data: Record<string, unknown> }[];

    const db = () => container.resolve(ContainerRegistrationKeys.PG_CONNECTION);
    const backdate = async (table: string, where: Record<string, string>, daysAgo: number) => {
      const at = new Date(Date.now() - daysAgo * DAY);
      await db()(table).where(where).update({ updated_at: at, created_at: at });
    };

    beforeEach(async () => {
      container = getContainer();
      cartModule = container.resolve(Modules.CART);
      await seedStore({ container } as Parameters<typeof seedStore>[0]);
      const [key] = await container.resolve(Modules.API_KEY).listApiKeys({ type: "publishable" });
      headers = { "x-publishable-api-key": key!.token };
      const [region] = await container.resolve(Modules.REGION).listRegions({});
      regionId = region!.id;
      const [channel] = await container.resolve(Modules.SALES_CHANNEL).listSalesChannels({});
      const [profile] = await container
        .resolve(Modules.FULFILLMENT)
        .listShippingProfiles({ type: "default" });
      const { result } = await createProductsWorkflow(container).run({
        input: {
          products: [
            {
              title: "Collar limpieza",
              status: "published",
              shipping_profile_id: profile!.id,
              sales_channels: [{ id: channel!.id }],
              options: [{ title: "Talla", values: ["Única"] }],
              variants: [
                {
                  title: "Única",
                  options: { Talla: "Única" },
                  manage_inventory: false,
                  prices: [{ currency_code: "eur", amount: 100 }],
                },
              ],
            },
          ],
        },
      });
      variantId = result[0]!.variants[0]!.id;
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

    const address = {
      first_name: "Ana",
      last_name: "López",
      address_1: "Calle Mayor 1",
      city: "Madrid",
      postal_code: "28001",
      country_code: "es",
    };

    /** Carrito del checkout hasta la sesión de pago (sin completar). */
    const checkoutCart = async (auth: Auth, email: string) => {
      const { cart } = (await api.post("/store/carts", { region_id: regionId }, auth)).data;
      await api.post(
        `/store/carts/${cart.id}/line-items`,
        { variant_id: variantId, quantity: 1 },
        auth,
      );
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
      const ses = await api.post(
        `/store/payment-collections/${pc.id}/payment-sessions`,
        { provider_id: "pp_system_default" },
        auth,
      );
      const session = (ses.data.payment_collection.payment_sessions as { id: string }[])[0]!;
      return { cartId: cart.id as string, sessionId: session.id, collectionId: pc.id as string };
    };

    const cartRow = async (id: string) => (await db()("cart").where({ id }))[0];

    /** Cliente con cuenta verificada (flujo de la fase 9). */
    const account = async (email: string) => {
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
        const e = events.slice(before).find((x) => x.name === "auth.verification_requested");
        if (e) code = String(e.data.code);
        else await new Promise((r) => setTimeout(r, 100));
      }
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
        auth: { headers: { ...headers, authorization: `Bearer ${relogin.data.token}` } } as Auth,
      };
    };

    it("invitado con email: borra la sesión de pago, el carrito y su ficha sin pedidos", async () => {
      const guest = await checkoutCart({ headers }, "invitada@example.com");
      const reciente = await checkoutCart({ headers }, "reciente@example.com");
      const { customer_id: guestCustomer } = await cartRow(guest.cartId);
      expect(guestCustomer).toBeTruthy();
      await backdate("cart", { id: guest.cartId }, 40);
      await backdate("cart_line_item", { cart_id: guest.cartId }, 40);

      const r = await deleteStaleCarts(container, { days: 30 });
      expect(r).toMatchObject({ deleted: 1, guests: 1, skipped: 0 });

      expect((await cartRow(guest.cartId)).deleted_at).toBeTruthy();
      expect((await cartRow(reciente.cartId)).deleted_at).toBeNull();
      // La sesión de pago ya no existe (Stripe: PaymentIntent cancelado)
      const sessions = await container
        .resolve(Modules.PAYMENT)
        .listPaymentSessions({ id: [guest.sessionId] });
      expect(sessions).toEqual([]);
      // Ficha del invitado: anonimizada y borrada (suave)
      const [c] = await container
        .resolve(Modules.CUSTOMER)
        .listCustomers({ id: guestCustomer }, { withDeleted: true });
      expect(c).toMatchObject({ email: anonymizedEmail(guestCustomer), first_name: null });
      expect(c!.deleted_at).toBeTruthy();
    });

    it("cliente con cuenta: no se borra; a los CART_EMPTY_DAYS se vacía", async () => {
      const ana = await account("ana-limpieza@example.com");
      const cart = await checkoutCart(ana.auth, "ana-limpieza@example.com");
      await backdate("cart", { id: cart.cartId }, 40);
      await backdate("cart_line_item", { cart_id: cart.cartId }, 40);

      // 40 días: no se toca (ni se borra ni se vacía)
      let r = await deleteStaleCarts(container, { days: 30, emptyDays: 90 });
      expect(r).toMatchObject({ deleted: 0, emptied: 0 });
      expect(await cartModule.listLineItems({ cart_id: cart.cartId })).toHaveLength(1);

      // 100 días: se vacía; el carrito, la ficha y la cuenta siguen
      await backdate("cart", { id: cart.cartId }, 100);
      await backdate("cart_line_item", { cart_id: cart.cartId }, 100);
      r = await deleteStaleCarts(container, { days: 30, emptyDays: 90 });
      expect(r).toMatchObject({ deleted: 0, emptied: 1, guests: 0 });
      expect((await cartRow(cart.cartId)).deleted_at).toBeNull();
      expect(await cartModule.listLineItems({ cart_id: cart.cartId })).toEqual([]);
      expect(await cartModule.listShippingMethods({ cart_id: cart.cartId })).toEqual([]);
      expect(
        await container.resolve(Modules.PAYMENT).listPaymentSessions({ id: [cart.sessionId] }),
      ).toEqual([]);
      const me = await api.get("/store/customers/me", ana.auth);
      expect(me.data.customer.id).toBe(ana.id);

      // Vacío: la siguiente pasada no hace nada
      r = await deleteStaleCarts(container, { days: 30, emptyDays: 90 });
      expect(r).toMatchObject({ deleted: 0, emptied: 0 });
    });

    it("purga: lo borrado hace más de PURGE_DAYS desaparece; lo reciente se queda", async () => {
      const viejo = await checkoutCart({ headers }, "purga@example.com");
      const reciente = await checkoutCart({ headers }, "purga-reciente@example.com");
      const { customer_id: guestCustomer } = await cartRow(viejo.cartId);
      for (const c of [viejo, reciente]) {
        await backdate("cart", { id: c.cartId }, 40);
        await backdate("cart_line_item", { cart_id: c.cartId }, 40);
      }
      await deleteStaleCarts(container, { days: 30 });
      // Borrado hace 100 días (el viejo) y hace 10 (el reciente)
      const ago = (d: number) => new Date(Date.now() - d * DAY);
      await db()("cart")
        .where({ id: viejo.cartId })
        .update({ deleted_at: ago(100) });
      await db()("customer")
        .where({ id: guestCustomer })
        .update({ deleted_at: ago(100) });
      await db()("cart")
        .where({ id: reciente.cartId })
        .update({ deleted_at: ago(10) });

      const r = await purgeDeleted(container, { days: 90 });
      expect(r).toMatchObject({ carts: 1, customers: 1 });
      expect(await db()("cart").where({ id: viejo.cartId })).toEqual([]);
      expect(await db()("cart_line_item").where({ cart_id: viejo.cartId })).toEqual([]);
      expect(await db()("cart_payment_collection").where({ cart_id: viejo.cartId })).toEqual([]);
      expect(await db()("customer").where({ id: guestCustomer })).toEqual([]);
      expect(await db()("cart").where({ id: reciente.cartId })).toHaveLength(1);

      // Nada más que purgar
      expect(await purgeDeleted(container, { days: 90 })).toMatchObject({
        carts: 0,
        customers: 0,
      });
    });
  },
});
