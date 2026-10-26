import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  beginReturnOrderWorkflow,
  cancelOrderTransferRequestWorkflow,
  cancelOrderWorkflow,
  createOrderFulfillmentWorkflow,
  createProductsWorkflow,
  requestOrderTransferWorkflow,
  transferOrderToGuestWorkflow,
} from "@medusajs/medusa/core-flows";
import seedStore from "../../src/scripts/seed";
import { accruePoints } from "../../src/lib/points-accrue";
import { AUTO_TRANSFER, CLAIM_TRANSFER, LINKED_META_KEY } from "../../src/lib/guest-orders";
import { linkAllGuestOrders } from "../../src/lib/guest-orders-link";
import { expireOrderTransfers } from "../../src/lib/guest-orders-claim";
import { linkOrderToAccountWorkflow } from "../../src/workflows/guest-orders";
import ordersAssign from "../../src/scripts/orders-assign";

/**
 * Pedidos de invitado → cuenta (Fase G). Spike G-0 (comportamiento de Medusa 2.21.2) + G-1:
 * - Con ficha de invitado previa, Medusa SIEMPRE pone en ella el pedido sin sesión (aunque el
 *   email tenga cuenta). Sin ficha previa, en la cuenta.
 * - Al crear la cuenta, sus pedidos de invitado (mismo email, sin cancelar) pasan a ella con la
 *   transferencia oficial: historial `transfer` confirmado, email de la cuenta, marca en metadata.
 * - C1: el pedido sin sesión de un cliente con cuenta acaba en la cuenta (subscriber).
 * - Puntos: el job abona los pedidos pasados; `POINTS_RETROACTIVE=false` excluye los de antes de
 *   la cuenta; `POINTS_ACCRUE_LOOKBACK_DAYS` amplía la ventana.
 * - Una solicitud pendiente bloquea otros cambios del pedido (devolución) hasta cancelarla.
 * - Vuelta atrás (Admin): transferOrderToGuestWorkflow; el script lo vuelve a enlazar.
 * - G-2: reclamar con nº de pedido + email (202 siempre), solo pedidos de invitado; email al
 *   email del pedido con el token; aceptar (pasa al email de la cuenta) o rechazar; la ruta
 *   estándar de solicitar está cerrada; las solicitudes caducan.
 */
jest.setTimeout(300 * 1000);

const DAY = 24 * 60 * 60 * 1000;
type Auth = { headers: Record<string, string> };
type Res = { status: number; data: Record<string, unknown> & { message?: string } };
const asRes = (e: { response: Res }) => e.response;

medusaIntegrationTestRunner({
  env: { STRIPE_API_KEY: "" },
  testSuite: ({ api, getContainer }) => {
    let container: MedusaContainer;
    let headers: Record<string, string>;
    let regionId: string;
    let variantId: string;
    let events: { name: string; data: Record<string, unknown> }[];

    const query = () => container.resolve(ContainerRegistrationKeys.QUERY);
    const db = () => container.resolve(ContainerRegistrationKeys.PG_CONNECTION);
    /** Variables que cambia el test de puntos (se restauran una a una: el runner fija otras). */
    const TOUCHED = [
      "POINTS_RETROACTIVE",
      "POINTS_ACCRUE_LOOKBACK_DAYS",
      "EMAIL_TRANSPORT",
    ] as const;

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

    afterEach(() => {
      jest.restoreAllMocks();
      for (const k of TOUCHED) delete process.env[k];
    });

    const waitEvent = async (name: string, after = 0) => {
      for (let i = 0; i < 50; i++) {
        const found = events.slice(after).find((e) => e.name === name);
        if (found) return found.data;
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error(`No se emitió ${name}`);
    };

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
        auth: { headers: { ...headers, authorization: `Bearer ${relogin.data.token}` } } as Auth,
      };
    };

    /**
     * Pedido como en el storefront: email + direcciones en una actualización (updateCartContact),
     * envío, pago y completar. Sin sesión = invitado.
     */
    const placeOrder = async (email: string, auth: Auth = { headers }) => {
      const { cart } = (await api.post("/store/carts", { region_id: regionId }, auth)).data;
      await api.post(
        `/store/carts/${cart.id}/line-items`,
        { variant_id: variantId, quantity: 1 },
        auth,
      );
      const address = {
        first_name: "A",
        last_name: "B",
        address_1: "C",
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

    const orderOwner = async (orderId: string) => {
      const { data } = await query().graph({
        entity: "order",
        fields: ["id", "email", "customer_id", "customer.has_account", "metadata"],
        filters: { id: orderId },
      });
      const o = data[0]!;
      return {
        email: o.email,
        customer_id: o.customer_id,
        has_account: Boolean(o.customer?.has_account),
        metadata: (o.metadata ?? null) as Record<string, unknown> | null,
      };
    };

    /** Espera a que el pedido sea de `customerId` (los subscribers corren en segundo plano). */
    const waitOwner = async (orderId: string, customerId: string) => {
      for (let i = 0; i < 60; i++) {
        const o = await orderOwner(orderId);
        if (o.customer_id === customerId) return o;
        await new Promise((r) => setTimeout(r, 100));
      }
      return orderOwner(orderId);
    };

    const myOrders = async (auth: Auth) =>
      (await api.get("/store/orders?fields=id,metadata", auth)).data.orders as {
        id: string;
        metadata?: Record<string, unknown> | null;
      }[];

    const ship = async (orderId: string, daysAgo: number) => {
      const { data } = await query().graph({
        entity: "order",
        // `total`: sin él Query no calcula las cantidades de las líneas (como en puntos.spec).
        fields: ["total", "items.id", "items.quantity"],
        filters: { id: orderId },
      });
      const [loc] = await container.resolve(Modules.STOCK_LOCATION).listStockLocations({});
      const { result } = await createOrderFulfillmentWorkflow(container).run({
        input: {
          order_id: orderId,
          location_id: loc!.id,
          items: data[0]!.items!.map((i) => ({ id: i!.id, quantity: Number(i!.quantity) })),
        },
      });
      await db()("fulfillment")
        .where({ id: result.id })
        .update({ shipped_at: new Date(Date.now() - daysAgo * DAY) });
    };

    it("G-0: con ficha de invitado previa, Medusa pone en ella el pedido sin sesión", async () => {
      // Sin ficha previa: acaba en la cuenta. Medusa ≤ 2.21 lo ponía ahí directamente; desde 2.22
      // (`findOrCreateCustomerStep` con `hasAccount: false` en create/update-cart) crea una ficha
      // de invitado y lo pasa a la cuenta el subscriber C1 (guest-orders-order-placed).
      const ana = await account("c1a@example.com");
      const direct = await placeOrder("c1a@example.com");
      await waitOwner(direct, ana.id);

      // Con ficha previa: Medusa elige el invitado (el subscriber C1 lo corrige después).
      const email = "c1b@example.com";
      const first = await placeOrder(email);
      const guestId = (await orderOwner(first)).customer_id;
      const luis = await account(email);
      await waitOwner(first, luis.id);
      const later = await placeOrder("C1B@Example.com"); // mayúsculas: Medusa normaliza
      const right_after = await orderOwner(later);
      expect(right_after.email).toBe(email);
      expect([guestId, luis.id]).toContain(right_after.customer_id);
    });

    it("al crear la cuenta pasan a ella sus pedidos de invitado (sin los cancelados)", async () => {
      const email = "ana@example.com";
      const o1 = await placeOrder(email);
      const o2 = await placeOrder(email);
      const canceled = await placeOrder(email);
      await cancelOrderWorkflow(container).run({ input: { order_id: canceled } });
      const other = await placeOrder("otra@example.com");

      const ana = await account(email);
      for (const id of [o1, o2]) {
        const o = await waitOwner(id, ana.id);
        expect(o).toMatchObject({ customer_id: ana.id, has_account: true, email });
        expect(o.metadata?.[LINKED_META_KEY]).toMatchObject({ reason: AUTO_TRANSFER.sameEmail });
      }
      expect((await orderOwner(canceled)).has_account).toBe(false);
      expect((await orderOwner(other)).has_account).toBe(false);

      // «Mis pedidos»: los dos, con la marca en metadata (insignia del storefront).
      const mine = await myOrders(ana.auth);
      expect(mine.map((o) => o.id).sort()).toEqual([o1, o2].sort());
      expect(mine.every((o) => o.metadata?.[LINKED_META_KEY])).toBe(true);

      // Historial del Admin: una transferencia confirmada con el motivo.
      const { data: changes } = await query().graph({
        entity: "order_change",
        fields: ["change_type", "status", "description"],
        filters: { order_id: o1 },
      });
      expect(changes).toEqual([
        { change_type: "transfer", status: "confirmed", description: AUTO_TRANSFER.sameEmail },
      ]);

      // Script de datos existentes: no queda nada por pasar.
      expect(await linkAllGuestOrders(container, false)).toEqual({
        accounts: 0,
        found: 0,
        linked: 0,
      });
    });

    it("C1: cliente con cuenta que compra sin entrar → el pedido acaba en la cuenta", async () => {
      const email = "c1@example.com";
      await placeOrder(email); // crea la ficha de invitado
      const ana = await account(email);
      const later = await placeOrder(email);
      const o = await waitOwner(later, ana.id);
      expect(o.customer_id).toBe(ana.id);
      expect((await myOrders(ana.auth)).map((x) => x.id)).toContain(later);
    });

    it("el workflow no pasa pedidos de otra cuenta, cancelados ni con otro email", async () => {
      const ana = await account("ana2@example.com");
      const luis = await account("luis2@example.com");
      const ofLuis = await placeOrder("luis2@example.com", luis.auth);
      const guest = await placeOrder("nadie@example.com");
      const canceled = await placeOrder("ana2-otro@example.com");
      await cancelOrderWorkflow(container).run({ input: { order_id: canceled } });
      const run = (order_id: string, reason: string = AUTO_TRANSFER.sameEmail) =>
        linkOrderToAccountWorkflow(container)
          .run({ input: { order_id, customer_id: ana.id, reason } })
          .then(() => "OK")
          .catch((e: Error) => e.message);
      expect(await run(ofLuis)).toBe("El pedido es de otra cuenta");
      expect(await run(guest)).toBe("El email no coincide");
      expect(await run(canceled, AUTO_TRANSFER.manual)).toBe("El pedido está cancelado");
      // Con motivo manual (G-3) sí, aunque el email sea otro; pasa al email de la cuenta.
      expect(await run(guest, AUTO_TRANSFER.manual)).toBe("OK");
      expect(await orderOwner(guest)).toMatchObject({
        customer_id: ana.id,
        email: "ana2@example.com",
      });
      expect(await run(guest, AUTO_TRANSFER.manual)).toBe("El pedido ya es de la cuenta");
    });

    it("puntos: POINTS_RETROACTIVE y POINTS_ACCRUE_LOOKBACK_DAYS", async () => {
      const email = "puntos@example.com";
      const before = await placeOrder(email);
      const ana = await account(email);
      await waitOwner(before, ana.id);
      const after = await placeOrder(email); // C1, después de crear la cuenta
      await waitOwner(after, ana.id);
      await ship(before, 15);
      await ship(after, 15);

      process.env.POINTS_RETROACTIVE = "false";
      expect((await accruePoints(container)).credited).toBe(1); // solo el de después
      const pending = await api.get("/store/customers/me/points", ana.auth);
      expect(pending.data.pending).toBe(0); // el de antes no se promete
      process.env.POINTS_RETROACTIVE = "true";
      expect((await accruePoints(container)).credited).toBe(1); // ahora el de antes
      expect((await api.get("/store/customers/me/points", ana.auth)).data.balance).toBe(1.6);

      // Ventana: un pedido de hace 130 días queda fuera con 120 y dentro con 365.
      const old = await placeOrder(email);
      await waitOwner(old, ana.id);
      await ship(old, 15);
      await db()("order")
        .where({ id: old })
        .update({ created_at: new Date(Date.now() - 130 * DAY) });
      expect((await accruePoints(container)).credited).toBe(0);
      process.env.POINTS_ACCRUE_LOOKBACK_DAYS = "365";
      expect((await accruePoints(container)).credited).toBe(1);
    });

    it("vuelta atrás (Admin) y script de datos existentes", async () => {
      const email = "vuelta@example.com";
      const order = await placeOrder(email);
      const ana = await account(email);
      await waitOwner(order, ana.id);
      await transferOrderToGuestWorkflow(container).run({
        input: { order_id: order, email, logged_in_user: "user_test" },
      });
      expect((await orderOwner(order)).has_account).toBe(false);

      expect(await linkAllGuestOrders(container, true)).toEqual({
        accounts: 1,
        found: 1,
        linked: 0,
      });
      expect((await orderOwner(order)).has_account).toBe(false); // dry-run: nada
      expect(await linkAllGuestOrders(container, false)).toEqual({
        accounts: 1,
        found: 1,
        linked: 1,
      });
      expect((await orderOwner(order)).customer_id).toBe(ana.id);
    });

    it("G-0: una solicitud pendiente bloquea una devolución hasta cancelarla", async () => {
      const order = await placeOrder("pend@example.com");
      const ana = await account("pend-cuenta@example.com");
      await requestOrderTransferWorkflow(container).run({
        input: { order_id: order, customer_id: ana.id, logged_in_user: ana.id },
      });
      const blocked = await beginReturnOrderWorkflow(container)
        .run({ input: { order_id: order } })
        .then(() => "OK")
        .catch((e: { message?: string }) => e.message ?? String(e));
      expect(blocked).toMatch(/active order change/);
      await cancelOrderTransferRequestWorkflow(container).run({
        input: { order_id: order, logged_in_user_id: "user_test", actor_type: "user" },
      });
      await beginReturnOrderWorkflow(container).run({ input: { order_id: order } });
    });

    it("G-3: orders:assign pasa un pedido de invitado con la nota; nunca uno de otra cuenta", async () => {
      const relay = await placeOrder("perdido@privaterelay.example");
      const ana = await account("ana-g3@example.com");
      const luis = await account("luis-g3@example.com");
      const ofLuis = await placeOrder("luis-g3@example.com", luis.auth);
      const displayOf = async (id: string) =>
        String(
          (await query().graph({ entity: "order", fields: ["display_id"], filters: { id } }))
            .data[0]!.display_id,
        );
      const run = (args: string[]) =>
        ordersAssign({ container, args } as unknown as Parameters<typeof ordersAssign>[0]);

      await run([
        await displayOf(relay),
        "ana-g3@example.com",
        "Comprobado",
        "por",
        "teléfono",
        "dry-run",
      ]);
      expect((await orderOwner(relay)).has_account).toBe(false);
      await run([`#${await displayOf(relay)}`, "ANA-G3@example.com", "Comprobado por teléfono"]);
      expect(await orderOwner(relay)).toMatchObject({
        customer_id: ana.id,
        email: "ana-g3@example.com",
      });
      const { data: changes } = await query().graph({
        entity: "order_change",
        fields: ["description", "internal_note", "status"],
        filters: { order_id: relay },
      });
      expect(changes[0]).toMatchObject({
        description: AUTO_TRANSFER.manual,
        internal_note: "Comprobado por teléfono",
        status: "confirmed",
      });

      // Entre cuentas: no (eso solo desde «Transfer ownership» del Admin).
      await run([await displayOf(ofLuis), "ana-g3@example.com", "No debería"]);
      expect((await orderOwner(ofLuis)).customer_id).toBe(luis.id);
    });

    describe("G-2: reclamar un pedido hecho con otro email", () => {
      const displayIdOf = async (orderId: string) => {
        const { data } = await query().graph({
          entity: "order",
          fields: ["display_id"],
          filters: { id: orderId },
        });
        return Number(data[0]!.display_id);
      };
      const claim = (auth: Auth, display_id: number | string, email: string) =>
        api.post("/store/customers/me/order-claims", { display_id, email }, auth).catch(asRes);
      const pending = async (orderId: string) => {
        const { data } = await query().graph({
          entity: "order_change",
          fields: ["id", "description", "actions.action", "actions.details"],
          filters: { order_id: orderId, status: ["requested"] },
        });
        const action = data[0]?.actions?.find((a) => String(a?.action) === "TRANSFER_CUSTOMER");
        return data[0]
          ? {
              description: data[0].description,
              token: (action?.details as { token?: string }).token!,
            }
          : null;
      };

      it("respuesta igual en todos los casos; solo crea solicitud para pedidos de invitado", async () => {
        const ana = await account("ana-g2@example.com");
        const luis = await account("luis-g2@example.com");
        const relay = await placeOrder("relay-g2@privaterelay.example");
        const ofLuis = await placeOrder("luis-g2@example.com", luis.auth);
        const canceled = await placeOrder("otro-g2@example.com");
        await cancelOrderWorkflow(container).run({ input: { order_id: canceled } });
        const relayId = await displayIdOf(relay);

        const cases = [
          [relayId, "otro@example.com"], // email que no coincide
          [999999, "relay-g2@privaterelay.example"], // no existe
          [await displayIdOf(ofLuis), "luis-g2@example.com"], // de otra cuenta
          [await displayIdOf(canceled), "otro-g2@example.com"], // cancelado
        ] as const;
        for (const [id, email] of cases) {
          const res = await claim(ana.auth, id, email);
          expect(res.status).toBe(202);
          expect(res.data).toEqual({ requested: true });
        }
        expect(await pending(relay)).toBeNull();
        expect(await pending(ofLuis)).toBeNull();
        // Sin sesión: 401; body inválido: 400
        expect((await claim({ headers }, relayId, "relay-g2@privaterelay.example")).status).toBe(
          401,
        );
        expect((await claim(ana.auth, "abc", "x")).status).toBe(400);

        // El bueno (mayúsculas en el email): solicitud de reclamación pendiente.
        const ok = await claim(ana.auth, relayId, "Relay-G2@PrivateRelay.example");
        expect(ok.status).toBe(202);
        expect((await pending(relay))?.description).toBe(CLAIM_TRANSFER);
        // Repetir no crea otra (y responde igual).
        expect((await claim(ana.auth, relayId, "relay-g2@privaterelay.example")).status).toBe(202);
        const { data: all } = await query().graph({
          entity: "order_change",
          fields: ["id"],
          filters: { order_id: relay },
        });
        expect(all).toHaveLength(1);
      });

      it("email al email del pedido; aceptar pasa el pedido (y su email) a la cuenta", async () => {
        process.env.EMAIL_TRANSPORT = "smtp";
        const notifications = container.resolve(Modules.NOTIFICATION);
        const sent: { to: string; template: string; data: Record<string, unknown> }[] = [];
        jest.spyOn(notifications, "createNotifications").mockImplementation((async (n: never) => {
          sent.push(n);
          return [];
        }) as never);

        const relay = await placeOrder("relay2@privaterelay.example");
        const ana = await account("ana-acepta@example.com");
        await claim(ana.auth, await displayIdOf(relay), "relay2@privaterelay.example");
        const req = await pending(relay);
        for (let i = 0; i < 50 && !sent.some((n) => n.template === "order-transfer"); i++) {
          await new Promise((r) => setTimeout(r, 100));
        }
        const mail = sent.find((n) => n.template === "order-transfer")!;
        expect(mail.to).toBe("relay2@privaterelay.example");
        expect(mail.data).toMatchObject({ requestedBy: "a***@example.com", expiresInDays: 7 });
        expect(String(mail.data.transferUrl)).toContain(
          `/cuenta/transferir/?pedido=${relay}&token=${req!.token}`,
        );

        // Datos de la página (sin token válido: 404)
        const info = await api.get(`/store/order-transfers/${relay}?token=${req!.token}`, {
          headers,
        });
        expect(info.data).toEqual({
          display_id: await displayIdOf(relay),
          requested_by: "a***@example.com",
        });
        expect(
          (await api.get(`/store/order-transfers/${relay}?token=malo`, { headers }).catch(asRes))
            .status,
        ).toBe(404);

        // Token malo → error; el bueno → pedido en la cuenta, con el email de la cuenta.
        const bad = await api
          .post(`/store/orders/${relay}/transfer/accept`, { token: "malo" }, { headers })
          .catch(asRes);
        expect(bad.status).toBeGreaterThanOrEqual(400);
        await api.post(
          `/store/orders/${relay}/transfer/accept`,
          { token: req!.token },
          { headers },
        );
        expect(await orderOwner(relay)).toMatchObject({
          customer_id: ana.id,
          email: "ana-acepta@example.com",
        });
        expect((await myOrders(ana.auth)).map((o) => o.id)).toContain(relay);
        // Las transferencias automáticas (G-1) no envían este email
        expect(sent.filter((n) => n.template === "order-transfer")).toHaveLength(1);
      });

      it("rechazar deja el pedido igual; la ruta estándar de solicitar está cerrada", async () => {
        const relay = await placeOrder("relay3@privaterelay.example");
        const ana = await account("ana-rechaza@example.com");
        const blocked = await api
          .post(`/store/orders/${relay}/transfer/request`, {}, ana.auth)
          .catch(asRes);
        expect(blocked.status).toBe(403);
        expect(
          (await api.post(`/store/orders/${relay}/transfer/cancel`, {}, ana.auth).catch(asRes))
            .status,
        ).toBe(403);
        expect(await pending(relay)).toBeNull();

        await claim(ana.auth, await displayIdOf(relay), "relay3@privaterelay.example");
        const req = await pending(relay);
        await api.post(
          `/store/orders/${relay}/transfer/decline`,
          { token: req!.token },
          { headers },
        );
        expect(await pending(relay)).toBeNull();
        expect(await orderOwner(relay)).toMatchObject({
          has_account: false,
          email: "relay3@privaterelay.example",
        });
      });

      it("su propio email: se pasa sin email; tope de solicitudes; caducidad", async () => {
        const email = "propio@example.com";
        // Pedido de invitado → G-1 lo pasa al crear la cuenta → el Admin lo devuelve al invitado
        // (p. ej. por error) → el cliente lo reclama con su propio email: se pasa sin email.
        const own = await placeOrder(email);
        const ana = await account(email);
        await waitOwner(own, ana.id);
        await transferOrderToGuestWorkflow(container).run({
          input: { order_id: own, email, logged_in_user: "user_test" },
        });
        expect((await orderOwner(own)).has_account).toBe(false);
        await claim(ana.auth, await displayIdOf(own), email);
        expect((await orderOwner(own)).customer_id).toBe(ana.id);

        // Tope: 3 pendientes por cliente
        const orders: string[] = [];
        for (let i = 0; i < 4; i++) orders.push(await placeOrder(`tope${i}@example.com`));
        for (let i = 0; i < 4; i++) {
          await claim(ana.auth, await displayIdOf(orders[i]!), `tope${i}@example.com`);
        }
        const pend = await Promise.all(orders.map(pending));
        expect(pend.filter(Boolean)).toHaveLength(3);

        // Caducidad: ninguna con 7 días; todas «dentro de 8 días»; el pedido queda libre.
        expect(await expireOrderTransfers(container)).toBe(0);
        expect(await expireOrderTransfers(container, new Date(Date.now() + 8 * DAY))).toBe(3);
        expect((await Promise.all(orders.map(pending))).filter(Boolean)).toHaveLength(0);
        await beginReturnOrderWorkflow(container).run({ input: { order_id: orders[0]! } });
      });
    });
  },
});
