import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  createOrderFulfillmentWorkflow,
  createOrderShipmentWorkflow,
  createProductsWorkflow,
} from "@medusajs/medusa/core-flows";
import seedStore from "../../src/scripts/seed";
import { EMAIL_CHANGE_MODULE } from "../../src/modules/email-change";
import type EmailChangeModuleService from "../../src/modules/email-change/service";
import { EMAIL_CHANGE_REQUESTED, EMAIL_CHANGED } from "../../src/workflows/email-change";

/**
 * Cambio de email de la cuenta (fase 13 punto 8, docs/fases/fase13-cuenta.md §2.6):
 * - POST /store/customers/me/email: sesión + contraseña; email libre y distinto → 202 y evento con
 *   el token; si no, 400 con el motivo.
 * - POST /store/email-change { token }: cambia el email de acceso (se entra con el nuevo, sin
 *   pedir verificación; con el antiguo no), el del cliente y el de los pedidos EN CURSO (los
 *   enviados no); token de un solo uso, caduca, y una solicitud nueva anula la anterior.
 */
jest.setTimeout(300 * 1000);

type Auth = { headers: Record<string, string> };
type Res = { status: number; data: Record<string, unknown> & { message?: string } };
const asRes = (e: { response: Res }) => e.response;
const PASSWORD = "Secreta-123";

medusaIntegrationTestRunner({
  env: { STRIPE_API_KEY: "" },
  testSuite: ({ api, getContainer }) => {
    let container: MedusaContainer;
    let headers: Record<string, string>;
    let regionId: string;
    let variantId: string;
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
              title: "Collar email",
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

    const waitEvent = async (name: string, after = 0) => {
      for (let i = 0; i < 50; i++) {
        const found = events.slice(after).find((e) => e.name === name);
        if (found) return found.data;
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error(`No se emitió ${name}`);
    };

    const login = (email: string, password = PASSWORD) =>
      api.post("/auth/customer/emailpass", { email, password }).catch(asRes);

    /** Cliente con cuenta verificada (flujo de la fase 9). */
    const account = async (email: string) => {
      await api.post("/auth/customer/emailpass/register", { email, password: PASSWORD });
      const first = await login(email);
      const before = events.length;
      await api.post(
        "/auth/verification/request",
        { entity_id: email, entity_type: "email" },
        { headers: { authorization: `Bearer ${first.data.token}` } },
      );
      const { code } = await waitEvent("auth.verification_requested", before);
      await api.post("/auth/verification/confirm", { code });
      const l = await login(email);
      const created = await api.post(
        "/store/customers",
        { email },
        { headers: { ...headers, authorization: `Bearer ${l.data.token}` } },
      );
      const relogin = await login(email);
      return {
        id: created.data.customer.id as string,
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
        .shipping_options as { id: string }[];
      await api.post(`/store/carts/${cart.id}/shipping-methods`, { option_id: opts[0]!.id }, auth);
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

    const request = (auth: Auth, body: Record<string, unknown>) =>
      api.post("/store/customers/me/email", body, auth).catch(asRes);
    const confirm = (token: string) =>
      api.post("/store/email-change", { token }, { headers }).catch(asRes);

    /** Pide el cambio y devuelve el token del evento (el del email). */
    const requestToken = async (auth: Auth, email: string) => {
      const before = events.length;
      const res = await request(auth, { email, password: PASSWORD });
      expect(res.status).toBe(202);
      return String((await waitEvent(EMAIL_CHANGE_REQUESTED, before)).token);
    };

    it("pedirlo: sesión, contraseña, email distinto y libre (si no, 400 sin cambiar nada)", async () => {
      expect(
        (await api.post("/store/customers/me/email", {}, { headers }).catch(asRes)).status,
      ).toBe(401);
      const ana = await account("ana-email-1@example.com");
      await account("luis-email-1@example.com");
      const wrong = await request(ana.auth, { email: "nuevo@example.com", password: "Otra-12345" });
      expect(wrong.status).toBe(400);
      expect(wrong.data.message).toMatch(/contraseña/);
      const same = await request(ana.auth, {
        email: "ANA-email-1@example.com",
        password: PASSWORD,
      });
      expect(same.data.message).toMatch(/Ese ya es/);
      const taken = await request(ana.auth, {
        email: "luis-email-1@example.com",
        password: PASSWORD,
      });
      expect(taken.data.message).toMatch(/Ya hay una cuenta/);
      expect((await request(ana.auth, { email: "no-es-email", password: PASSWORD })).status).toBe(
        400,
      );
      // El token solo se guarda como hash
      const token = await requestToken(ana.auth, "ana-nueva-1@example.com");
      const [row] = await container
        .resolve<EmailChangeModuleService>(EMAIL_CHANGE_MODULE)
        .listEmailChanges({ customer_id: ana.id });
      expect(row!.token_hash).not.toContain(token);
      expect(row!.new_email).toBe("ana-nueva-1@example.com");
      // Nada cambia hasta confirmar
      expect((await api.get("/store/customers/me", ana.auth)).data.customer.email).toBe(
        "ana-email-1@example.com",
      );
    });

    it("confirmar: email de acceso, cliente y pedidos en curso; un solo uso", async () => {
      const ana = await account("ana-email-2@example.com");
      const enCurso = await placeOrder("ana-email-2@example.com", ana.auth);
      const enviado = await placeOrder("ana-email-2@example.com", ana.auth);
      await ship(enviado);

      expect((await confirm("token-que-no-existe")).status).toBe(400);
      const token = await requestToken(ana.auth, "Ana-Nueva-2@example.com");
      const before = events.length;
      const ok = await confirm(token);
      expect(ok.data).toEqual({ email: "ana-nueva-2@example.com" });
      expect(await waitEvent(EMAIL_CHANGED, before)).toMatchObject({
        old_email: "ana-email-2@example.com",
        new_email: "ana-nueva-2@example.com",
      });

      // Se entra con el nuevo (sin pedir verificación) y no con el antiguo
      const viejo = await login("ana-email-2@example.com");
      expect(viejo.status).toBe(401);
      const nuevo = await login("ana-nueva-2@example.com");
      expect(nuevo.data.verification_required).toBeUndefined();
      const auth = {
        headers: { ...headers, authorization: `Bearer ${nuevo.data.token}` },
      };
      expect((await api.get("/store/customers/me", auth)).data.customer).toMatchObject({
        id: ana.id,
        email: "ana-nueva-2@example.com",
      });
      // La sesión anterior sigue valiendo (el token lleva el id, no el email)
      expect((await api.get("/store/customers/me", ana.auth)).status).toBe(200);

      // Pedidos: el en curso cambia; el enviado se queda con el suyo
      const { data: orders } = await query().graph({
        entity: "order",
        fields: ["id", "email"],
        filters: { id: [enCurso, enviado] },
      });
      const emailOf = (id: string) => orders.find((o) => o.id === id)!.email;
      expect(emailOf(enCurso)).toBe("ana-nueva-2@example.com");
      expect(emailOf(enviado)).toBe("ana-email-2@example.com");

      // Un solo uso
      expect((await confirm(token)).status).toBe(400);
    });

    it("volver al email anterior (ya verificado una vez): también se puede", async () => {
      const ana = await account("ana-email-5@example.com");
      await confirm(await requestToken(ana.auth, "ana-otra-5@example.com"));
      expect((await login("ana-otra-5@example.com")).status).toBe(200);
      const back = await confirm(await requestToken(ana.auth, "ana-email-5@example.com"));
      expect(back.data).toEqual({ email: "ana-email-5@example.com" });
      const relogin = await login("ana-email-5@example.com");
      expect(relogin.status).toBe(200);
      expect(relogin.data.verification_required).toBeUndefined();
      expect((await login("ana-otra-5@example.com")).status).toBe(401);
    });

    it("caducado o sustituido por otra solicitud: no vale", async () => {
      const ana = await account("ana-email-3@example.com");
      const first = await requestToken(ana.auth, "ana-a-3@example.com");
      const second = await requestToken(ana.auth, "ana-b-3@example.com");
      expect((await confirm(first)).status).toBe(400);
      // Caducado
      const svc = container.resolve<EmailChangeModuleService>(EMAIL_CHANGE_MODULE);
      const [row] = await svc.listEmailChanges({ customer_id: ana.id });
      await svc.updateEmailChanges({ id: row!.id, expires_at: new Date(Date.now() - 1000) });
      const expired = await confirm(second);
      expect(expired.status).toBe(400);
      expect(expired.data.message).toMatch(/caducado/);
      expect((await api.get("/store/customers/me", ana.auth)).data.customer.email).toBe(
        "ana-email-3@example.com",
      );
    });

    it("el email nuevo se ocupa entretanto: no se cambia nada", async () => {
      const ana = await account("ana-email-4@example.com");
      const token = await requestToken(ana.auth, "ocupado-4@example.com");
      await account("ocupado-4@example.com");
      const res = await confirm(token);
      expect(res.status).toBe(400);
      expect(res.data.message).toMatch(/Ya hay una cuenta/);
      expect((await login("ana-email-4@example.com")).status).toBe(200);
    });
  },
});
