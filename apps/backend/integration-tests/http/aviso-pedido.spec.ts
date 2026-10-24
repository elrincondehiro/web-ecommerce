import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { createProductsWorkflow } from "@medusajs/medusa/core-flows";
import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import seedStore from "../../src/scripts/seed";

/**
 * Aviso de pedido nuevo a la tienda (Fase M, subscriber `order-placed-shop-notify`):
 * - email `order-received-shop` a SHOP_NOTIFY_EMAIL con el pedido y las mascotas VIVAS (con la
 *   salud consentida) y el enlace al Admin;
 * - push a ntfy (aquí, un servidor local falso) con título, prioridad, etiqueta y enlace, SIN datos
 *   personales.
 * Con `STRIPE_API_KEY` vacía la región del seed acepta `pp_system_default` (como invitados.spec.ts).
 */
jest.setTimeout(180 * 1000);

medusaIntegrationTestRunner({
  inApp: true,
  env: { STRIPE_API_KEY: "" },
  testSuite: ({ api, getContainer }) => {
    let container: MedusaContainer;
    let headers: Record<string, string>;
    let events: { name: string; data: Record<string, unknown> }[];
    const base = { name: "Hiro", species: "perro" };
    const TOUCHED = [
      "EMAIL_TRANSPORT",
      "SHOP_NOTIFY_EMAIL",
      "NTFY_URL",
      "NTFY_ORDERS_TOPIC",
      "NTFY_TOKEN",
      "ADMIN_URL",
    ] as const;

    beforeEach(async () => {
      container = getContainer();
      await seedStore({ container } as Parameters<typeof seedStore>[0]);
      const [key] = await container.resolve(Modules.API_KEY).listApiKeys({ type: "publishable" });
      headers = { "x-publishable-api-key": key!.token };
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
      return { auth: { headers: { ...headers, authorization: `Bearer ${relogin.data.token}` } } };
    };

    it("pedido nuevo: email a la tienda con las mascotas y push ntfy sin datos personales", async () => {
      const [region] = await container.resolve(Modules.REGION).listRegions({});
      const [shop] = await container.resolve(Modules.SALES_CHANNEL).listSalesChannels({});
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
              sales_channels: [{ id: shop!.id }],
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
      const variantId = result[0]!.variants[0]!.id;

      // ntfy falso en local: guarda lo que recibe.
      const pushes: { url: string; headers: IncomingHttpHeaders; body: string }[] = [];
      const server = createServer((req, res) => {
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          pushes.push({ url: req.url ?? "", headers: req.headers, body });
          res.end("{}");
        });
      });
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
      const port = (server.address() as AddressInfo).port;
      process.env.EMAIL_TRANSPORT = "smtp";
      process.env.SHOP_NOTIFY_EMAIL = "tienda@example.com";
      process.env.NTFY_URL = `http://127.0.0.1:${port}`;
      process.env.NTFY_ORDERS_TOPIC = "pedidos-secreto";
      process.env.NTFY_TOKEN = "tk_test";
      process.env.ADMIN_URL = "https://admin.example.com";
      const notifications = container.resolve(Modules.NOTIFICATION);
      const sent: { to: string; template: string; data: Record<string, unknown> }[] = [];
      jest.spyOn(notifications, "createNotifications").mockImplementation((async (n: never) => {
        sent.push(n);
        return [];
      }) as never);

      try {
        const ana = await customerAuth("pedido-mascotas@example.com");
        await api.post(
          "/store/customers/me/pets",
          { ...base, breed: "Border collie", health: "Alergia al pollo", health_consent: true },
          ana.auth,
        );
        await api.post(
          "/store/customers/me/pets",
          { name: "Luna", species: "gato", birth_year: 2008, death_year: 2023 },
          ana.auth,
        );

        const auth = ana.auth;
        const { cart } = (await api.post("/store/carts", { region_id: region!.id }, auth)).data;
        await api.post(
          `/store/carts/${cart.id}/line-items`,
          { variant_id: variantId, quantity: 2 },
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
          {
            email: "pedido-mascotas@example.com",
            shipping_address: address,
            billing_address: address,
          },
          auth,
        );
        const opts = (await api.get(`/store/shipping-options?cart_id=${cart.id}`, auth)).data
          .shipping_options as { id: string }[];
        await api.post(
          `/store/carts/${cart.id}/shipping-methods`,
          { option_id: opts[0]!.id },
          auth,
        );
        const pc = (await api.post("/store/payment-collections", { cart_id: cart.id }, auth)).data
          .payment_collection;
        await api.post(
          `/store/payment-collections/${pc.id}/payment-sessions`,
          { provider_id: "pp_system_default" },
          auth,
        );
        const done = await api.post(`/store/carts/${cart.id}/complete`, {}, auth);
        const order = done.data.order as { id: string; display_id: number };

        for (let i = 0; i < 100; i++) {
          if (sent.some((n) => n.template === "order-received-shop") && pushes.length) break;
          await new Promise((r) => setTimeout(r, 100));
        }
        const mail = sent.find((n) => n.template === "order-received-shop")!;
        expect(mail.to).toBe("tienda@example.com");
        expect(mail.data).toMatchObject({
          displayId: order.display_id,
          customerEmail: "pedido-mascotas@example.com",
          hasAccount: true,
          adminOrderUrl: `https://admin.example.com/app/orders/${order.id}`,
          pets: [{ name: "Hiro", health: "Alergia al pollo" }],
        });
        // La confirmación al cliente sigue saliendo.
        expect(sent.some((n) => n.template === "order-placed")).toBe(true);

        expect(pushes).toHaveLength(1);
        const push = pushes[0]!;
        expect(push.url).toBe("/pedidos-secreto");
        expect(push.headers).toMatchObject({
          title: `Pedido nuevo n. ${order.display_id}`,
          priority: "high",
          tags: "shopping_cart",
          click: `https://admin.example.com/app/orders/${order.id}`,
          authorization: "Bearer tk_test",
        });
        expect(push.body).toMatch(
          new RegExp(`^Pedido n\\.º ${order.display_id} · .+ · 2 artículos$`),
        );
        // Sin datos personales en el push.
        const raw = JSON.stringify(push);
        for (const secret of ["pedido-mascotas", "Ana", "López", "Mayor", "Hiro", "pollo"]) {
          expect(raw).not.toContain(secret);
        }
      } finally {
        await new Promise((r) => server.close(r));
      }
    });
  },
});
