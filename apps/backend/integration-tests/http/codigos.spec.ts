import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { cancelOrderWorkflow, createProductsWorkflow } from "@medusajs/medusa/core-flows";
import seedStore, { PRODUCT_TYPE_IVA_REDUCIDO } from "../../src/scripts/seed";
import { CODE_MESSAGES } from "../../src/lib/codes";
import { pointsMovementWorkflow } from "../../src/workflows/points";

/**
 * Códigos descuento (Fase P). Helpers como en puntos.spec.ts. Sin Stripe: el seed usa
 * `pp_system_default`.
 * - Aplicar (normalizado), sustituir (uno por pedido), quitar; errores; carrito ajeno; sin sesión;
 *   la Store API estándar de promociones (y `promo_codes`) cerrada.
 * - Caducado, agotado y uno por cliente con aviso claro; cancelar devuelve el uso (idempotente).
 * - Código + puntos: tope tras el código, recorte con aviso (Q2), ≥ 0,50 € en cualquier orden.
 */
jest.setTimeout(300 * 1000);

const DAY = 24 * 60 * 60 * 1000;
type Res = { status: number; data: Record<string, unknown> & { message?: string } };
const asRes = (e: { response: Res }) => e.response;

medusaIntegrationTestRunner({
  env: { STRIPE_API_KEY: "" },
  testSuite: ({ api, getContainer }) => {
    let container: MedusaContainer;
    let headers: Record<string, string>;
    let regionId: string;
    let channelId: string;
    let events: { name: string; data: Record<string, unknown> }[];
    let v21: string; // 30 € con IVA al 21 %
    let v10: string; // 70 € con IVA al 10 %

    const query = () => container.resolve(ContainerRegistrationKeys.QUERY);

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
          products: [mk("Collar", 30), mk("Pienso", 70, { type_id: type10!.id })],
        },
      });
      [v21, v10] = result.map((p) => p.variants[0]!.id);

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

    const createCode = async (
      code: string,
      am: { type: "percentage" | "fixed"; value: number },
      opts: { limit?: number; perCustomer?: number; endsAt?: Date } = {},
    ) => {
      const pm = container.resolve(Modules.PROMOTION);
      const budget = opts.limit
        ? { type: "usage" as const, limit: opts.limit }
        : opts.perCustomer
          ? { type: "use_by_attribute" as const, limit: opts.perCustomer, attribute: "customer_id" }
          : undefined;
      const [p] = await pm.createPromotions([
        {
          code,
          type: "standard",
          status: "active",
          is_tax_inclusive: true,
          application_method: {
            type: am.type,
            target_type: "order",
            allocation: "across",
            value: am.value,
            currency_code: "eur",
          },
          ...(budget || opts.endsAt
            ? {
                campaign: {
                  name: code,
                  campaign_identifier: code,
                  ...(opts.endsAt
                    ? { starts_at: new Date(Date.now() - DAY), ends_at: opts.endsAt }
                    : {}),
                  ...(budget ? { budget } : {}),
                },
              }
            : {}),
        } as never,
      ]);
      return p!;
    };

    const detail = async (cartId: string) => {
      const { data } = await query().graph({
        entity: "cart",
        fields: ["total", "items.adjustments.code", "items.adjustments.amount", "promotions.code"],
        filters: { id: cartId },
      });
      const c = data[0] as unknown as {
        total: number;
        items: { adjustments: { code: string; amount: number }[] }[];
        promotions: { code: string }[];
      };
      const by: Record<string, number> = {};
      for (const i of c.items)
        for (const a of i.adjustments) {
          const k = a.code.startsWith("PTS-") ? "PTS" : a.code;
          by[k] = Math.round(((by[k] ?? 0) + Number(a.amount)) * 100) / 100;
        }
      return {
        total: Number(c.total),
        by,
        codes: c.promotions.map((p) => (p.code.startsWith("PTS-") ? "PTS" : p.code)).sort(),
      };
    };
    const applyCode = (cartId: string, code: string, auth: { headers: Record<string, string> }) =>
      api.post(`/store/carts/${cartId}/code`, { code }, auth).catch(asRes);

    it("aplicar, sustituir (uno por pedido), quitar; invitado y ruta estándar cerrados", async () => {
      const ana = await customer("ana@example.com");
      const luis = await customer("luis@example.com");
      await createCode("PCT10", { type: "percentage", value: 10 });
      await createCode("FIX5", { type: "fixed", value: 5 });
      const cartId = await newCart(ana.auth, [
        [v21, 1],
        [v10, 1],
      ]); // 100 € + 4,95 €

      // Minúsculas y espacios: se normaliza
      const ok = await applyCode(cartId, " pct10 ", ana.auth);
      expect(ok.status).toBe(200);
      expect(ok.data).toEqual({ code: "PCT10", points_adjusted: null });
      expect(await detail(cartId)).toEqual({ total: 94.95, by: { PCT10: 10 }, codes: ["PCT10"] });
      // Otro código: sustituye (uno por pedido)
      await applyCode(cartId, "FIX5", ana.auth);
      expect(await detail(cartId)).toEqual({ total: 99.95, by: { FIX5: 5 }, codes: ["FIX5"] });

      // GET de puntos: código y su descuento
      const info = (await api.get(`/store/carts/${cartId}/points`, ana.auth)).data;
      expect(info.code).toBe("FIX5");
      expect(info.code_amount).toBe(5);

      // Errores
      const bad = await applyCode(cartId, "NOEXISTE", ana.auth);
      expect(bad.status).toBe(400);
      expect(bad.data.message).toBe(CODE_MESSAGES.invalid);
      expect((await applyCode(cartId, "PTS-ABC", ana.auth)).status).toBe(400);
      expect((await applyCode(cartId, "FIX5", luis.auth)).status).toBe(404); // carrito ajeno
      expect(
        (await api.post(`/store/carts/${cartId}/code`, { code: "FIX5" }, { headers }).catch(asRes))
          .status,
      ).toBe(401);

      // Ruta estándar cerrada (también para el dueño) y promo_codes al crear / actualizar
      for (const res of [
        await api
          .post(`/store/carts/${cartId}/promotions`, { promo_codes: ["PCT10"] }, ana.auth)
          .catch(asRes),
        await api
          .post("/store/carts", { region_id: regionId, promo_codes: ["PCT10"] }, { headers })
          .catch(asRes),
        await api.post(`/store/carts/${cartId}`, { promo_codes: ["PCT10"] }, ana.auth).catch(asRes),
      ]) {
        expect(res.status).toBe(403);
      }
      expect((await detail(cartId)).codes).toEqual(["FIX5"]);

      // Quitar
      const del = await api.delete(`/store/carts/${cartId}/code`, ana.auth);
      expect(del.data).toEqual({ removed: true });
      expect(await detail(cartId)).toEqual({ total: 104.95, by: {}, codes: [] });
    });

    it("caducado, agotado y uno por cliente: aviso claro; cancelar devuelve el uso", async () => {
      const ana = await customer("ana@example.com");
      const luis = await customer("luis@example.com");
      await createCode(
        "OLD",
        { type: "fixed", value: 5 },
        { endsAt: new Date(Date.now() - 60_000) },
      );
      await createCode("ONCE", { type: "fixed", value: 5 }, { limit: 1 });
      await createCode("PERCUS", { type: "fixed", value: 5 }, { perCustomer: 1 });

      const c0 = await newCart(ana.auth, [[v21, 1]]);
      const old = await applyCode(c0, "OLD", ana.auth);
      expect(old.status).toBe(400);
      expect(old.data.message).toBe(CODE_MESSAGES.notApplied);

      // ONCE: Ana lo usa → agotado para todos; al cancelar, vuelve a estar disponible
      await applyCode(c0, "ONCE", ana.auth);
      const done = await pay(c0, ana.auth);
      expect(done.data.type).toBe("order");
      const c1 = await newCart(luis.auth, [[v21, 1]]);
      expect((await applyCode(c1, "ONCE", luis.auth)).data.message).toBe(CODE_MESSAGES.notApplied);
      await cancelOrderWorkflow(container).run({ input: { order_id: done.data.order.id } });
      await container
        .resolve(Modules.EVENT_BUS)
        .emit({ name: "order.canceled", data: { id: done.data.order.id } });
      // Los subscribers son asíncronos: se espera a que el uso vuelva a 0 y entonces se aplica.
      const used = async () => {
        const [p] = await container
          .resolve(Modules.PROMOTION)
          .listPromotions({ code: "ONCE" }, { relations: ["campaign", "campaign.budget"] });
        return Number(p!.campaign!.budget!.used);
      };
      for (let i = 0; i < 100 && (await used()) !== 0; i++) {
        await new Promise((r) => setTimeout(r, 200));
      }
      expect(await used()).toBe(0);
      expect((await applyCode(c1, "ONCE", luis.auth)).status).toBe(200);
      // Idempotente: otro order.canceled no deja el uso en negativo ni lo «regala» otra vez
      await container
        .resolve(Modules.EVENT_BUS)
        .emit({ name: "order.canceled", data: { id: done.data.order.id } });
      await new Promise((r) => setTimeout(r, 1000));
      expect(await used()).toBe(0);

      // PERCUS: uno por cliente
      const c2 = await newCart(ana.auth, [[v21, 1]]);
      await applyCode(c2, "PERCUS", ana.auth);
      expect((await pay(c2, ana.auth)).data.type).toBe("order");
      const c3 = await newCart(ana.auth, [[v21, 1]]);
      expect((await applyCode(c3, "PERCUS", ana.auth)).data.message).toBe(CODE_MESSAGES.notApplied);
      const c4 = await newCart(luis.auth, [[v21, 1]]);
      expect((await applyCode(c4, "PERCUS", luis.auth)).status).toBe(200);
    });

    it("código + puntos: tope tras el código, recorte con aviso y ≥ 0,50 € en cualquier orden", async () => {
      const ana = await customer("ana@example.com");
      await credit(ana.id, 200);
      await createCode("PCT10", { type: "percentage", value: 10 });
      await createCode("FIX20", { type: "fixed", value: 20 });

      // 30 € + 4,95 € de envío. Sin código: máx. 30 € (el envío cubre los 0,50 €).
      const cartId = await newCart(ana.auth, [[v21, 1]]);
      await api.post(`/store/carts/${cartId}/points`, { amount: 30 }, ana.auth);
      expect((await detail(cartId)).total).toBe(4.95);
      // Añadir FIX20: los puntos ya no caben (30 − 20 = 10) → se recortan a 10 con aviso
      const fix = await applyCode(cartId, "FIX20", ana.auth);
      expect(fix.data.points_adjusted).toBe(10);
      expect(await detail(cartId)).toEqual({
        total: 4.95,
        by: { FIX20: 20, PTS: 10 },
        codes: ["FIX20", "PTS"],
      });
      expect((await api.get(`/store/carts/${cartId}/points`, ana.auth)).data.max).toBe(10);
      // Más de lo que cabe tras el código → 400
      expect(
        (await api.post(`/store/carts/${cartId}/points`, { amount: 11 }, ana.auth).catch(asRes))
          .status,
      ).toBe(400);

      // Código en % con muchos puntos: Medusa aplica antes los puntos (mayor valor, spike P-0)
      // y el % sobre lo que queda; el total nunca baja de lo permitido.
      await applyCode(cartId, "PCT10", ana.auth); // sustituye FIX20 → máx. puntos = 30 − 3 = 27
      const after = await detail(cartId);
      expect(after.codes).toEqual(["PCT10", "PTS"]);
      expect(after.by.PTS).toBe(10); // cabían: no se tocan
      await api.post(`/store/carts/${cartId}/points`, { amount: 27 }, ana.auth);
      const both = await detail(cartId);
      expect(both.by.PTS).toBe(27);
      expect(both.by.PCT10).toBe(0.3); // 10 % de (30 − 27)
      expect(both.total).toBeGreaterThanOrEqual(0.5 + 4.95 - 0.01);

      // Sin envío que cubra el mínimo: 1 producto de 30 € con envío gratis no hay; se comprueba
      // la regla con el pago: el pedido se completa con código + puntos.
      const done = await pay(cartId, ana.auth);
      expect(done.data.type).toBe("order");
    });
  },
});
