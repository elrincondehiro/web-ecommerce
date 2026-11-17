import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  cancelOrderWorkflow,
  createOrderFulfillmentWorkflow,
  createOrderShipmentWorkflow,
  createProductsWorkflow,
} from "@medusajs/medusa/core-flows";
import seedStore from "../../src/scripts/seed";
import { anonymizedEmail } from "../../src/lib/account-deletion";
import { REF } from "../../src/lib/points";
import { POINTS_MODULE } from "../../src/modules/points";
import type PointsModuleService from "../../src/modules/points/service";
import { WISHLIST_MODULE } from "../../src/modules/wishlist";
import type WishlistModuleService from "../../src/modules/wishlist/service";
import { PETS_MODULE } from "../../src/modules/pets";
import type PetsModuleService from "../../src/modules/pets/service";
import { pointsMovementWorkflow } from "../../src/workflows/points";
import { ACCOUNT_DELETED } from "../../src/workflows/delete-account";

/**
 * Baja de la cuenta (fase 13, docs/fases/fase13-cuenta.md):
 * - POST /store/customers/me/delete: sesión, frase y contraseña; con pedidos en curso, 400 sin
 *   tocar nada; si no, ficha anonimizada, sin direcciones ni acceso, saldo de puntos a 0 (con los
 *   movimientos), lista de deseos, mascotas y carritos borrados, historial de emails anonimizado y
 *   los pedidos intactos.
 * - DELETE /admin/customers/:id (ruta propia): la misma baja.
 */
jest.setTimeout(300 * 1000);

type Auth = { headers: Record<string, string> };
type Res = { status: number; data: Record<string, unknown> & { message?: string } };
const asRes = (e: { response: Res }) => e.response;
const PASSWORD = "Secreta-123";
const PHRASE = "Eliminar mi cuenta";

medusaIntegrationTestRunner({
  env: { STRIPE_API_KEY: "" },
  testSuite: ({ api, getContainer }) => {
    let container: MedusaContainer;
    let headers: Record<string, string>;
    let regionId: string;
    let variantId: string;
    let productId: string;
    let events: { name: string; data: Record<string, unknown> }[];

    const query = () => container.resolve(ContainerRegistrationKeys.QUERY);

    beforeEach(async () => {
      container = getContainer();
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
              title: "Collar baja",
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
      productId = result[0]!.id;
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

    const waitEvent = async (name: string, after = 0) => {
      for (let i = 0; i < 50; i++) {
        const found = events.slice(after).find((e) => e.name === name);
        if (found) return found.data;
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error(`No se emitió ${name}`);
    };

    const until = async (fn: () => Promise<boolean>) => {
      for (let i = 0; i < 50; i++) {
        if (await fn()) return true;
        await new Promise((r) => setTimeout(r, 100));
      }
      return false;
    };

    /** Cliente con cuenta verificada (flujo de la fase 9). */
    const account = async (email: string) => {
      await api.post("/auth/customer/emailpass/register", { email, password: PASSWORD });
      const first = await api.post("/auth/customer/emailpass", { email, password: PASSWORD });
      const before = events.length;
      await api.post(
        "/auth/verification/request",
        { entity_id: email, entity_type: "email" },
        { headers: { authorization: `Bearer ${first.data.token}` } },
      );
      const { code } = await waitEvent("auth.verification_requested", before);
      await api.post("/auth/verification/confirm", { code });
      const login = await api.post("/auth/customer/emailpass", { email, password: PASSWORD });
      const created = await api.post(
        "/store/customers",
        { email, first_name: "Ana", last_name: "López", phone: "+34600123456" },
        { headers: { ...headers, authorization: `Bearer ${login.data.token}` } },
      );
      const relogin = await api.post("/auth/customer/emailpass", { email, password: PASSWORD });
      return {
        id: created.data.customer.id as string,
        email,
        auth: { headers: { ...headers, authorization: `Bearer ${relogin.data.token}` } } as Auth,
      };
    };

    const address = {
      first_name: "Ana",
      last_name: "López",
      address_1: "Calle Mayor 1",
      city: "Madrid",
      postal_code: "28001",
      country_code: "es",
    };

    /** Pedido como en el storefront (con sesión). */
    const placeOrder = async (email: string, auth: Auth) => {
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
        .shipping_options as { id: string; name: string }[];
      const std = opts.find((o) => o.name === "Envío estándar") ?? opts[0]!;
      await api.post(`/store/carts/${cart.id}/shipping-methods`, { option_id: std.id }, auth);
      const pc = (await api.post("/store/payment-collections", { cart_id: cart.id }, auth)).data
        .payment_collection;
      await api.post(
        `/store/payment-collections/${pc.id}/payment-sessions`,
        { provider_id: "pp_system_default" },
        auth,
      );
      const done = await api.post(`/store/carts/${cart.id}/complete`, {}, auth);
      return done.data.order.id as string;
    };

    /** Prepara y marca como enviado todo el pedido. */
    const ship = async (orderId: string) => {
      const { data } = await query().graph({
        entity: "order",
        fields: ["total", "items.id", "items.quantity"],
        filters: { id: orderId },
      });
      const items = data[0]!.items!.map((i) => ({ id: i!.id, quantity: Number(i!.quantity) }));
      const [loc] = await container.resolve(Modules.STOCK_LOCATION).listStockLocations({});
      const { result } = await createOrderFulfillmentWorkflow(container).run({
        input: { order_id: orderId, location_id: loc!.id, items },
      });
      await createOrderShipmentWorkflow(container).run({
        input: { order_id: orderId, fulfillment_id: result.id, items },
      });
    };

    const del = (auth: Auth, body: Record<string, unknown>) =>
      api.post("/store/customers/me/delete", body, auth).catch(asRes);

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

    it("401 sin sesión; 400 sin la frase o con otra contraseña (no borra nada)", async () => {
      expect(
        (await api.post("/store/customers/me/delete", {}, { headers }).catch(asRes)).status,
      ).toBe(401);
      const ana = await account("ana-baja-1@example.com");
      expect((await del(ana.auth, { password: PASSWORD })).status).toBe(400);
      expect((await del(ana.auth, { phrase: "borrar", password: PASSWORD })).status).toBe(400);
      const wrong = await del(ana.auth, { phrase: PHRASE, password: "Otra-12345" });
      expect(wrong.status).toBe(400);
      expect(wrong.data.message).toMatch(/contraseña/);
      // Campos fuera del esquema (otro cliente) → 400
      expect(
        (await del(ana.auth, { phrase: PHRASE, password: PASSWORD, customer_id: "cus_x" })).status,
      ).toBe(400);
      const me = await api.get("/store/customers/me", ana.auth);
      expect(me.data.customer.email).toBe(ana.email);
    });

    it("pedido en curso → 400 sin borrar; enviado o cancelado → baja completa", async () => {
      const ana = await account("ana-baja-2@example.com");
      await api.post("/store/customers/me/addresses", address, ana.auth);
      const order = await placeOrder(ana.email, ana.auth);
      const canceled = await placeOrder(ana.email, ana.auth);
      await cancelOrderWorkflow(container).run({ input: { order_id: canceled } });

      const blocked = await del(ana.auth, { phrase: PHRASE, password: PASSWORD });
      expect(blocked.status).toBe(400);
      expect(blocked.data.message).toMatch(/pedidos en curso/);
      expect((await api.get("/store/customers/me", ana.auth)).data.customer.email).toBe(ana.email);

      // Datos que se borran: lista de deseos, mascota, puntos y un carrito abierto.
      await api.post("/store/customers/me/wishlist/items", { product_id: productId }, ana.auth);
      await api.post("/store/customers/me/pets", { name: "Hiro", species: "perro" }, ana.auth);
      await pointsMovementWorkflow(container).run({
        input: {
          customer_id: ana.id,
          type: "credit",
          amount: 3.5,
          reference: REF.adjustment,
          reference_id: "test-baja",
        },
      });
      const { cart } = (await api.post("/store/carts", { region_id: regionId }, ana.auth)).data;

      await ship(order);
      const before = events.length;
      const res = await del(ana.auth, {
        phrase: "  eliminar   MI cuenta ",
        password: PASSWORD,
        reason: "Me mudo\u0007",
      });
      expect(res.status).toBe(200);
      const ev = await waitEvent(ACCOUNT_DELETED, before);
      expect(ev).toMatchObject({ customer_id: ana.id, reason: "Me mudo", via: "cuenta" });
      expect(ev.email).toBe(ana.email);

      // Ficha anonimizada y borrada (suave), sin direcciones
      const customerModule = container.resolve(Modules.CUSTOMER);
      const [c] = await customerModule.listCustomers(
        { id: ana.id },
        { withDeleted: true, relations: ["addresses"] },
      );
      expect(c).toMatchObject({
        email: anonymizedEmail(ana.id),
        first_name: null,
        last_name: null,
        phone: null,
        metadata: null,
      });
      expect(c!.deleted_at).toBeTruthy();
      expect(
        await customerModule.listCustomerAddresses({ customer_id: ana.id }, { withDeleted: false }),
      ).toEqual([]);

      // Sin acceso: el login falla y el token ya no vale
      const login = await api
        .post("/auth/customer/emailpass", { email: ana.email, password: PASSWORD })
        .catch(asRes);
      expect(login.status).toBe(401);
      expect((await api.get("/store/customers/me", ana.auth).catch(asRes)).status).not.toBe(200);

      // Puntos: saldo 0, movimientos conservados
      const points = container.resolve<PointsModuleService>(POINTS_MODULE);
      const acc = await points.findAccount(ana.id);
      expect(await points.getBalance(acc!.id)).toBe(0);
      const trx = await points.listPointsTransactions({ account_id: acc!.id });
      expect(trx.map((t) => t.reference).sort()).toEqual([REF.deleted, REF.adjustment].sort());

      // Subscribers de customer.deleted: lista, mascotas y carrito
      const wishlists = container.resolve<WishlistModuleService>(WISHLIST_MODULE);
      const pets = container.resolve<PetsModuleService>(PETS_MODULE);
      const cartModule = container.resolve(Modules.CART);
      expect(
        await until(async () => {
          const [w, p, carts] = await Promise.all([
            wishlists.listWishlists({ customer_id: ana.id }),
            pets.listPets({ customer_id: ana.id }),
            cartModule.listCarts({ id: cart.id }),
          ]);
          return !w.length && !p.length && !carts.length;
        }),
      ).toBe(true);

      // Los pedidos se conservan, con sus datos
      const { data: orders } = await query().graph({
        entity: "order",
        fields: ["id", "email", "customer_id"],
        filters: { id: [order, canceled] },
      });
      expect(orders).toHaveLength(2);
      expect(orders.every((o) => o.email === ana.email && o.customer_id === ana.id)).toBe(true);

      // Se puede volver a crear una cuenta con el mismo email
      await api.post("/auth/customer/emailpass/register", {
        email: ana.email,
        password: PASSWORD,
      });
    });

    it("historial de emails: los enviados al cliente pasan al email anónimo", async () => {
      const ana = await account("ana-baja-3@example.com");
      const notifications = container.resolve(Modules.NOTIFICATION) as unknown as {
        createNotifications(d: Record<string, unknown>): Promise<unknown>;
        listNotifications(f: Record<string, unknown>): Promise<{ to: string; data: unknown }[]>;
      };
      // Sin EMAIL_TRANSPORT no hay proveedor del canal email: se usa el `feed` (local).
      await notifications.createNotifications({
        to: ana.email,
        channel: "feed",
        template: "welcome",
        data: { accountUrl: "x" },
      });
      expect((await del(ana.auth, { phrase: PHRASE, password: PASSWORD })).status).toBe(200);
      expect(await notifications.listNotifications({ to: ana.email })).toEqual([]);
      const [n] = await notifications.listNotifications({ to: anonymizedEmail(ana.id) });
      expect(n).toMatchObject({ data: null });
    });

    it("Admin: DELETE /admin/customers/:id hace la misma baja (y respeta los pedidos en curso)", async () => {
      const admin = await adminAuth();
      const ana = await account("ana-baja-4@example.com");
      const order = await placeOrder(ana.email, ana.auth);
      const blocked = await api.delete(`/admin/customers/${ana.id}`, admin).catch(asRes);
      expect(blocked.status).toBe(400);

      await cancelOrderWorkflow(container).run({ input: { order_id: order } });
      const before = events.length;
      const res = await api.delete(`/admin/customers/${ana.id}`, admin);
      expect(res.data).toEqual({ id: ana.id, object: "customer", deleted: true });
      expect(await waitEvent(ACCOUNT_DELETED, before)).toMatchObject({ via: "admin" });
      const [c] = await container
        .resolve(Modules.CUSTOMER)
        .listCustomers({ id: ana.id }, { withDeleted: true });
      expect(c!.email).toBe(anonymizedEmail(ana.id));
      const login = await api
        .post("/auth/customer/emailpass", { email: ana.email, password: PASSWORD })
        .catch(asRes);
      expect(login.status).toBe(401);
    });
  },
});
