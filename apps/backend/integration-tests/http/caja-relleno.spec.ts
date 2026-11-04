import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  beginOrderEditOrderWorkflow,
  cancelBeginOrderEditWorkflow,
  capturePaymentWorkflow,
} from "@medusajs/medusa/core-flows";
import seedStore from "../../src/scripts/seed";
import importCatalog from "../../src/scripts/import-catalog";
import { CAJA_MODULE } from "../../src/modules/caja";
import type CajaModuleService from "../../src/modules/caja/service";
import { processCajas } from "../../src/lib/caja-jobs";

/**
 * Rellenar la caja de snacks desde el Admin (Fase CS-3). Edición de pedido con líneas a 0 €:
 * - solo con el pago capturado (con el pago solo autorizado, Medusa 2.22.2 cancelaría el cobro);
 * - solo snacks (snacks-perro/gato y sus hijas), PVP ≥ lo pagado; granel en gramos (sin el mínimo);
 * - reserva aunque la web diga 0 (la caja se prepara mirando el stock físico);
 * - rehacer: el contenido anterior de esa caja a 0 y las reservas se recalculan;
 * - el envío se bloquea hasta prepararla (middleware de POST /admin/orders/:id/fulfillments).
 * Sin Stripe: el seed usa `pp_system_default` (el pago se autoriza y se captura aquí).
 */
jest.setTimeout(300 * 1000);

const PLANTILLA = path.join(__dirname, "../../catalog/plantilla");
type ApiError = { response: { status: number; data: { message?: string } } };
const fail = (e: ApiError) => e.response;
// Snacks: OREJAS (6 €, stock 10), TIRAS (8 €, stock 0) y un collar (no snack)
// y un granel: PREMIOS (paso 5 g, mínimo 100 g, 20 €/kg, 1000 g)
const SNACKS = `handle,titulo,categorias,iva,estado,sku,precio,stock,peso_g,granel,paso_g,min_g,precio_kg,stock_g
orejas,Orejas,snacks-perro,reducido,publicado,OREJAS,6,10,100,,,,,
tiras,Tiras,snacks-perro,reducido,publicado,TIRAS,8,0,100,,,,,
collar,Collar,collares-perro,general,publicado,COLLAR,30,5,100,,,,,
premios,Premios,snacks-perro,reducido,publicado,PREMIOS,,,,sí,5,100,20,1000
`;
const caja = (nombre: string) => ({
  caja_animal: "perro",
  caja_nombre: nombre,
  caja_cachorro: false,
  caja_edad: 3,
  caja_peso: 12.5,
  caja_pelo: "igual",
  caja_ref: crypto.randomUUID(),
});

medusaIntegrationTestRunner({
  env: { STRIPE_API_KEY: "" },
  testSuite: ({ api, getContainer }) => {
    let container: MedusaContainer;
    let headers: Record<string, string>;
    let admin: { headers: Record<string, string> };
    let regionId: string;
    const query = () => container.resolve(ContainerRegistrationKeys.QUERY);
    const variantId = async (sku: string) =>
      (await query().graph({ entity: "product_variant", fields: ["id"], filters: { sku } }))
        .data[0]!.id;
    const level = async (sku: string) => {
      const { data } = await query().graph({
        entity: "inventory_item",
        fields: ["location_levels.stocked_quantity", "location_levels.reserved_quantity"],
        filters: { sku },
      });
      const l = data[0]!.location_levels![0]!;
      return { stocked: Number(l.stocked_quantity), reserved: Number(l.reserved_quantity) };
    };

    async function adminHeaders() {
      const email = `admin-${Date.now()}@example.com`;
      const password = "Admin-123456";
      const user = await container.resolve(Modules.USER).createUsers({ email });
      const auth = container.resolve(Modules.AUTH);
      const { authIdentity } = await auth.register("emailpass", {
        body: { email, password },
      } as never);
      await auth.updateAuthIdentities({ id: authIdentity!.id, app_metadata: { user_id: user.id } });
      const login = await api.post("/auth/user/emailpass", { email, password });
      return { headers: { authorization: `Bearer ${login.data.token as string}` } };
    }

    /** Pedido con las cajas dadas (importe → datos), pagado con el proveedor de sistema. */
    async function order(boxes: [string, Record<string, unknown>][]) {
      const cart = (
        await api.post("/store/carts", { region_id: regionId, email: "a@example.com" }, { headers })
      ).data.cart as { id: string };
      for (const [sku, metadata] of boxes) {
        await api.post(
          `/store/carts/${cart.id}/line-items`,
          { variant_id: await variantId(sku), quantity: 1, metadata },
          { headers },
        );
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
        { headers },
      );
      const opts = (await api.get(`/store/shipping-options?cart_id=${cart.id}`, { headers })).data
        .shipping_options;
      await api.post(
        `/store/carts/${cart.id}/shipping-methods`,
        { option_id: opts[0].id },
        { headers },
      );
      const pc = (await api.post("/store/payment-collections", { cart_id: cart.id }, { headers }))
        .data.payment_collection;
      await api.post(
        `/store/payment-collections/${pc.id}/payment-sessions`,
        { provider_id: "pp_system_default" },
        { headers },
      );
      const done = await api.post(`/store/carts/${cart.id}/complete`, {}, { headers });
      const o = done.data.order as {
        id: string;
        items: { id: string; metadata: Record<string, unknown> }[];
      };
      const capture = async () => {
        const { data: pays } = await query().graph({
          entity: "payment",
          fields: ["id"],
          filters: { payment_collection_id: pc.id },
        });
        await capturePaymentWorkflow(container).run({ input: { payment_id: pays[0]!.id } });
      };
      return { ...o, capture, paymentCollectionId: pc.id as string };
    }

    const cajas = (orderId: string) => api.get(`/admin/orders/${orderId}/cajas`, admin);
    const fill = (orderId: string, lineId: string, items: { sku: string; quantity: number }[]) =>
      Promise.all(
        items.map(async (i) => ({ variant_id: await variantId(i.sku), quantity: i.quantity })),
      ).then((body) =>
        api.post(`/admin/orders/${orderId}/cajas/${lineId}`, { items: body }, admin).catch(fail),
      );
    const ship = async (orderId: string) => {
      const { data } = await query().graph({
        entity: "order",
        fields: ["items.id", "items.quantity"],
        filters: { id: orderId },
      });
      const [loc] = await container.resolve(Modules.STOCK_LOCATION).listStockLocations({});
      return api
        .post(
          `/admin/orders/${orderId}/fulfillments`,
          {
            location_id: loc!.id,
            items: data[0]!
              .items!.filter((i) => Number(i!.quantity) > 0)
              .map((i) => ({ id: i!.id, quantity: Number(i!.quantity) })),
          },
          admin,
        )
        .catch(fail);
    };

    const propose = (orderId: string) =>
      api.post(`/admin/orders/${orderId}/cajas/proponer`, {}, admin).catch(fail);
    /** Tokens del último `caja.propuesta` (el email los lleva; en la base solo está el hash). */
    let proposals: { order_id: string; tokens: { line_item_id: string; token: string }[] }[] = [];
    const answer = (
      lineId: string,
      body: { pedido: string; token: string; respuesta: string; motivo?: string },
    ) => api.post(`/store/cajas/${lineId}`, body, { headers }).catch(fail);
    /** Propone y acepta todas las cajas del pedido (como el cliente desde el email). */
    const acceptAll = async (orderId: string) => {
      expect((await propose(orderId)).status).toBe(200);
      const p = await waitProposal(orderId);
      for (const t of p.tokens) {
        expect(
          (await answer(t.line_item_id, { pedido: orderId, token: t.token, respuesta: "aceptar" }))
            .status,
        ).toBe(200);
      }
    };
    const waitProposal = async (orderId: string, after = 0) => {
      for (let i = 0; i < 50; i++) {
        const found = proposals.slice(after).find((p) => p.order_id === orderId);
        if (found) return found;
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error("No se emitió caja.propuesta");
    };

    afterEach(() => {
      jest.restoreAllMocks();
      for (const k of ["EMAIL_TRANSPORT", "SHOP_NOTIFY_EMAIL", "CAJA_FESTIVOS"])
        delete process.env[k];
    });

    beforeEach(async () => {
      container = getContainer();
      proposals = [];
      const eventBus = container.resolve(Modules.EVENT_BUS);
      const emit = eventBus.emit.bind(eventBus);
      jest.spyOn(eventBus, "emit").mockImplementation(async (data, options) => {
        for (const m of Array.isArray(data) ? data : [data]) {
          if (m.name === "caja.propuesta") proposals.push(m.data as never);
        }
        return emit(data, options);
      });
      await seedStore({ container } as Parameters<typeof seedStore>[0]);
      const dir = await mkdtemp(path.join(os.tmpdir(), "caja-relleno-"));
      await cp(path.join(PLANTILLA, "categorias.csv"), path.join(dir, "categorias.csv"));
      await importCatalog({ container, args: [dir] } as Parameters<typeof importCatalog>[0]);
      await writeFile(path.join(dir, "productos.csv"), SNACKS);
      await importCatalog({ container, args: [dir] } as Parameters<typeof importCatalog>[0]);
      await rm(dir, { recursive: true, force: true });
      await importCatalog({
        container,
        args: [path.join(PLANTILLA, "caja")],
      } as Parameters<typeof importCatalog>[0]);
      const [key] = await container.resolve(Modules.API_KEY).listApiKeys({ type: "publishable" });
      headers = { "x-publishable-api-key": key!.token };
      const [region] = await container.resolve(Modules.REGION).listRegions({});
      regionId = region!.id;
      admin = await adminHeaders();
    });

    it("pedido → pendiente; solo con el pago capturado; reglas del contenido; PVP ≥ pagado", async () => {
      const o = await order([["CAJA-SNACKS-25", caja("Toby")]]);
      const line = o.items[0]!.id;
      // Subscriber de order.placed: una caja pendiente (asíncrono)
      const service = container.resolve<CajaModuleService>(CAJA_MODULE);
      for (let i = 0; i < 50 && !(await service.listCajas({ order_id: o.id })).length; i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      const first = (await cajas(o.id)).data;
      expect(first.cajas).toHaveLength(1);
      expect(first.cajas[0]).toMatchObject({
        line_item_id: line,
        estado: "pendiente",
        editable: true,
        paid: 25,
        content: [],
      });
      expect(first.cajas[0].name).toBe("Para Toby");
      expect(first.cajas[0].details[0]).toBe("Perro");
      // Pago solo autorizado: no se puede (Medusa cancelaría el cobro) y no hay snacks que elegir
      expect(first.blocked).toMatch(/Captura el pago/);
      expect(first.snacks).toEqual([]);
      const early = await fill(o.id, line, [{ sku: "OREJAS", quantity: 5 }]);
      expect(early.status).toBe(400);
      expect(early.data.message).toMatch(/Captura el pago/);
      // El envío también está bloqueado
      expect((await ship(o.id)).data.message).toMatch(/cajas de snacks sin aceptar/);

      await o.capture();
      const ready = (await cajas(o.id)).data;
      expect(ready.blocked).toBeNull();
      // Solo snacks (Orejas y Tiras; ni el collar ni la propia caja), con PVP y libre en la web
      expect(
        ready.snacks.map((s: { sku: string; price: number; available: number }) => [
          s.sku,
          s.price,
          s.available,
        ]),
      ).toEqual([
        ["OREJAS", 6, 10],
        ["PREMIOS", 0.1, 1000], // granel: precio de un paso (5 g) y libre en gramos
        ["TIRAS", 8, 0],
      ]);
      expect(ready.snacks[1]).toMatchObject({ step_g: 5, price_kg: 20 });

      // Reglas: no snack, PVP por debajo, repetidos, vacío
      expect((await fill(o.id, line, [{ sku: "COLLAR", quantity: 1 }])).data.message).toMatch(
        /Solo se pueden meter productos de Snacks/,
      );
      const low = await fill(o.id, line, [{ sku: "OREJAS", quantity: 4 }]);
      expect(low.status).toBe(400);
      expect(low.data.message).toBe(
        "El contenido vale 24,00 € (PVP) y la caja 25,00 €: tiene que valer al menos lo pagado.",
      );
      expect((await fill(o.id, line, [])).status).toBe(400);
      expect(
        (
          await fill(o.id, line, [
            { sku: "OREJAS", quantity: 2 },
            { sku: "OREJAS", quantity: 3 },
          ])
        ).data.message,
      ).toMatch(/repetido/);
      expect(await level("OREJAS")).toEqual({ stocked: 10, reserved: 0 });

      // Válido: 3 Orejas (18 €) + 1 Tiras (8 €, a 0 en la web) = 26 € ≥ 25 €
      const ok = await fill(o.id, line, [
        { sku: "OREJAS", quantity: 3 },
        { sku: "TIRAS", quantity: 1 },
      ]);
      expect(ok.status).toBe(200);
      expect(ok.data.cajas[0]).toMatchObject({ estado: "rellena", intento: 1 });
      expect(
        ok.data.cajas[0].content.map((c: { title: string; quantity: number }) => [
          c.title,
          c.quantity,
        ]),
      ).toEqual([
        ["Orejas", 3],
        ["Tiras", 1],
      ]);
      // Total y cobro intactos; contenido a 0 €; reservas (Tiras en negativo: decisión del usuario)
      const { data } = await query().graph({
        entity: "order",
        fields: [
          "total",
          "summary.pending_difference",
          "items.unit_price",
          "items.metadata",
          "payment_collections.status",
        ],
        filters: { id: o.id },
      });
      expect(Number(data[0]!.summary!.pending_difference)).toBe(0);
      expect(data[0]!.payment_collections!.map((p) => p!.status)).toEqual(["completed"]);
      const content = data[0]!.items!.filter((i) => i!.metadata?.caja_de === line);
      expect(content.map((i) => Number(i!.unit_price))).toEqual([0, 0]);
      expect(await level("OREJAS")).toEqual({ stocked: 10, reserved: 3 });
      expect(await level("TIRAS")).toEqual({ stocked: 0, reserved: 1 });

      // Rehacer (aún sin proponer): 5 Orejas = 30 €. Tiras sale; las reservas se recalculan
      const redo = await fill(o.id, line, [{ sku: "OREJAS", quantity: 5 }]);
      expect(redo.status).toBe(200);
      expect(redo.data.cajas[0]).toMatchObject({ estado: "rellena", intento: 2 });
      expect(redo.data.cajas[0].content).toHaveLength(1);
      expect(await level("OREJAS")).toEqual({ stocked: 10, reserved: 5 });
      expect(await level("TIRAS")).toEqual({ stocked: 0, reserved: 0 });

      // Granel (en gramos, sin el mínimo de 100 g de la web): 4 Orejas (24 €) + 50 g (1 €) = 25 €
      const bulkBad = await fill(o.id, line, [
        { sku: "OREJAS", quantity: 4 },
        { sku: "PREMIOS", quantity: 52 },
      ]);
      expect(bulkBad.data.message).toMatch(/Gramos no válidos/);
      const bulk = await fill(o.id, line, [
        { sku: "OREJAS", quantity: 4 },
        { sku: "PREMIOS", quantity: 50 },
      ]);
      expect(bulk.status).toBe(200);
      expect(
        bulk.data.cajas[0].content.map((c: { title: string; quantity: number; step_g: number }) => [
          c.title,
          c.quantity,
          c.step_g,
        ]),
      ).toEqual([
        ["Orejas", 4, null],
        ["Premios", 50, 5],
      ]);
      expect(await level("OREJAS")).toEqual({ stocked: 10, reserved: 4 });
      expect(await level("PREMIOS")).toEqual({ stocked: 1000, reserved: 50 });

      // Preparada pero sin aceptar: no se envía. Propuesta + aceptada → sí; descuenta el contenido
      expect((await ship(o.id)).data.message).toMatch(/sin aceptar/);
      await acceptAll(o.id);
      expect((await ship(o.id)).status).toBe(200);
      expect(await level("OREJAS")).toEqual({ stocked: 6, reserved: 0 });
      expect(await level("PREMIOS")).toEqual({ stocked: 950, reserved: 0 });
    });

    it("varias cajas: cada una con lo suyo; el envío espera a todas; otra edición abierta bloquea", async () => {
      const o = await order([
        ["CAJA-SNACKS-15", caja("Toby")],
        ["CAJA-SNACKS-15", caja("Luna")],
      ]);
      await o.capture();
      const byName = (n: string) => o.items.find((i) => i.metadata?.caja_nombre === n)!.id;
      const [toby, luna] = [byName("Toby"), byName("Luna")];
      expect((await fill(o.id, toby!, [{ sku: "OREJAS", quantity: 3 }])).status).toBe(200);
      // Una preparada y otra no: ni se envía ni se puede proponer (un email con todas)
      expect((await ship(o.id)).data.message).toMatch(/sin aceptar/);
      expect((await propose(o.id)).data.message).toMatch(/todas las cajas del pedido/);

      // Edición abierta a mano en el Admin: no se pisa
      await beginOrderEditOrderWorkflow(container).run({
        input: { order_id: o.id, created_by: "test" },
      });
      expect((await cajas(o.id)).data.blocked).toMatch(/edición sin terminar/);
      expect((await fill(o.id, luna!, [{ sku: "TIRAS", quantity: 2 }])).data.message).toMatch(
        /edición sin terminar/,
      );
      await cancelBeginOrderEditWorkflow(container).run({ input: { order_id: o.id } });

      const second = await fill(o.id, luna!, [{ sku: "TIRAS", quantity: 2 }]);
      expect(second.status).toBe(200);
      // Rellenar Luna no toca lo de Toby
      const views = second.data.cajas as { line_item_id: string; content: unknown[] }[];
      expect(views.find((c) => c.line_item_id === toby)!.content).toHaveLength(1);
      expect(views.find((c) => c.line_item_id === luna)!.content).toHaveLength(1);
      expect(await level("OREJAS")).toEqual({ stocked: 10, reserved: 3 });
      expect(await level("TIRAS")).toEqual({ stocked: 0, reserved: 2 });
      await acceptAll(o.id);
      expect((await ship(o.id)).status).toBe(200);

      // Una línea que no es caja, o de otro pedido
      expect((await fill(o.id, "ordli_nope", [{ sku: "OREJAS", quantity: 3 }])).status).toBe(404);
    });

    it("CS-4: proponer (un email con todas), rechazar con motivo, rehacer, aceptar; enlace de un solo uso", async () => {
      process.env.EMAIL_TRANSPORT = "smtp";
      process.env.SHOP_NOTIFY_EMAIL = "tienda@example.com";
      const sent: { to: string; template: string; data: Record<string, unknown> }[] = [];
      jest
        .spyOn(container.resolve(Modules.NOTIFICATION), "createNotifications")
        .mockImplementation((async (n: never) => {
          sent.push(n);
          return [];
        }) as never);
      const waitSent = async (template: string, n = 1) => {
        for (let i = 0; i < 50 && sent.filter((m) => m.template === template).length < n; i++) {
          await new Promise((r) => setTimeout(r, 100));
        }
        return sent.filter((m) => m.template === template);
      };

      const o = await order([
        ["CAJA-SNACKS-15", caja("Toby")],
        ["CAJA-SNACKS-15", caja("Luna")],
      ]);
      await o.capture();
      const byName = (n: string) => o.items.find((i) => i.metadata?.caja_nombre === n)!.id;
      const [toby, luna] = [byName("Toby"), byName("Luna")];
      await fill(o.id, toby, [{ sku: "OREJAS", quantity: 3 }]);
      await fill(o.id, luna, [
        { sku: "PREMIOS", quantity: 150 },
        { sku: "OREJAS", quantity: 2 },
      ]);
      // Sin proponer, la Store API no enseña nada (ni el estado)
      const before = (await api.get(`/store/cajas?pedido=${o.id}`, { headers })).data.cajas;
      expect(before.map((c: { estado: string }) => c.estado)).toEqual(["preparando", "preparando"]);

      // Proponer: UN email al cliente con las dos cajas, su contenido y un enlace por caja
      expect((await propose(o.id)).data.count).toBe(2);
      const p1 = await waitProposal(o.id);
      const [mail] = await waitSent("caja-propuesta");
      expect(mail!.to).toBe("a@example.com");
      const boxes = mail!.data.cajas as { name: string; content: string[]; url: string }[];
      // Orden del email: por el nombre de la mascota
      expect(boxes.map((b) => [b.name, b.content])).toEqual([
        ["Luna", ["150 g · Premios", "2 × Orejas"]],
        ["Toby", ["3 × Orejas"]],
      ]);
      expect(boxes[1]!.url).toContain(`/cuenta/caja/?pedido=${o.id}&caja=${toby}&token=`);
      expect(String(mail!.data.deadline)).toMatch(/^el .+ a las \d\d:\d\d$/);
      // En la base solo está el hash
      const service = container.resolve<CajaModuleService>(CAJA_MODULE);
      const rows = await service.listCajas({ order_id: o.id });
      for (const t of p1.tokens) {
        expect(rows.find((r) => r.line_item_id === t.line_item_id)!.token_hash).not.toBe(t.token);
      }
      // Ya propuestas: no se pueden cambiar
      expect((await fill(o.id, toby, [{ sku: "OREJAS", quantity: 4 }])).data.message).toMatch(
        /propuesta o aceptada/,
      );
      const tTok = p1.tokens.find((t) => t.line_item_id === toby)!.token;
      const lTok = p1.tokens.find((t) => t.line_item_id === luna)!.token;

      // Página de la caja: con el token, el contenido; sin él (o el de otra caja), 404
      const view = await api.get(`/store/cajas/${toby}?pedido=${o.id}&token=${tTok}`, { headers });
      expect(view.data).toMatchObject({ name: "Toby", content: ["3 × Orejas"] });
      expect(view.data.vence_at).toBeTruthy();
      expect(
        (
          await api
            .get(`/store/cajas/${toby}?pedido=${o.id}&token=${lTok}`, { headers })
            .catch(fail)
        ).status,
      ).toBe(404);

      // Luna: rechazo sin motivo → 400; con motivo → rechazada, aviso a la tienda con el motivo
      expect(
        (await answer(luna, { pedido: o.id, token: lTok, respuesta: "rechazar" })).status,
      ).toBe(400);
      const no = await answer(luna, {
        pedido: o.id,
        token: lTok,
        respuesta: "rechazar",
        motivo: "Las orejas le sientan mal",
      });
      expect(no.data.estado).toBe("rechazada");
      const [shop] = await waitSent("caja-tienda");
      expect(shop!.to).toBe("tienda@example.com");
      expect(shop!.data).toMatchObject({
        kind: "rechazada",
        name: "Luna",
        motivo: "Las orejas le sientan mal",
      });
      // De un solo uso: el mismo enlace ya no vale
      expect((await answer(luna, { pedido: o.id, token: lTok, respuesta: "aceptar" })).status).toBe(
        404,
      );
      // Toby: acepta
      expect(
        (await answer(toby, { pedido: o.id, token: tTok, respuesta: "aceptar" })).data.estado,
      ).toBe("aceptada");
      const states = (await api.get(`/store/cajas?pedido=${o.id}`, { headers })).data.cajas;
      expect(
        Object.fromEntries(
          states.map((c: { line_item_id: string; estado: string }) => [c.line_item_id, c.estado]),
        ),
      ).toEqual({
        [toby]: "aceptada",
        [luna]: "preparando",
      });

      // Admin: la rechazada se ve con el motivo y se rehace; otra propuesta, solo con Luna
      const admin1 = (await cajas(o.id)).data.cajas as {
        line_item_id: string;
        estado: string;
        motivo_rechazo: string;
        editable: boolean;
      }[];
      expect(admin1.find((c) => c.line_item_id === luna)).toMatchObject({
        estado: "rechazada",
        motivo_rechazo: "Las orejas le sientan mal",
        editable: true,
      });
      expect((await ship(o.id)).status).toBe(400);
      expect((await propose(o.id)).status).toBe(400); // rechazada sin rehacer
      expect((await fill(o.id, luna, [{ sku: "PREMIOS", quantity: 750 }])).status).toBe(200);
      const n = proposals.length;
      expect((await propose(o.id)).data.count).toBe(1);
      const p2 = await waitProposal(o.id, n);
      expect(p2.tokens.map((t) => t.line_item_id)).toEqual([luna]);
      const mails = await waitSent("caja-propuesta", 2);
      expect((mails[1]!.data.cajas as { name: string }[]).map((b) => b.name)).toEqual(["Luna"]);

      // 24 h sin respuesta: el job la acepta sola (aviso solo a la tienda) y ya se puede enviar
      const later = new Date(Date.now() + 25 * 60 * 60 * 1000);
      expect(await processCajas(container, later)).toMatchObject({ accepted: 1 });
      // Avisos a la tienda: rechazo de Luna, aceptación de Toby y aceptación automática de Luna
      const shopMails = await waitSent("caja-tienda", 3);
      expect(shopMails.map((m) => [m.data.kind, m.data.name, m.data.readyToShip])).toEqual([
        ["rechazada", "Luna", false],
        ["aceptada", "Toby", false],
        ["aceptada_auto", "Luna", true],
      ]);
      // Al cliente, solo las dos propuestas (la aceptación automática no le avisa)
      expect(
        sent
          .filter((m) => m.to === "a@example.com" && m.template.startsWith("caja"))
          .map((m) => m.template),
      ).toEqual(["caja-propuesta", "caja-propuesta"]);
      expect((await ship(o.id)).status).toBe(200);
    });

    it("CS-4: aviso de 48 h laborables sin preparar (una vez); festivos y fin de semana no cuentan", async () => {
      process.env.EMAIL_TRANSPORT = "smtp";
      process.env.SHOP_NOTIFY_EMAIL = "tienda@example.com";
      const sent: { template: string; data: Record<string, unknown> }[] = [];
      jest
        .spyOn(container.resolve(Modules.NOTIFICATION), "createNotifications")
        .mockImplementation((async (n: never) => {
          sent.push(n);
          return [];
        }) as never);
      const o = await order([["CAJA-SNACKS-15", caja("Toby")]]);
      const service = container.resolve<CajaModuleService>(CAJA_MODULE);
      for (let i = 0; i < 50 && !(await service.listCajas({ order_id: o.id })).length; i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      const [row] = await service.listCajas({ order_id: o.id });
      // Pedido el viernes 6 a las 10:00 (Madrid): el lunes 9 es festivo → avisa el miércoles 11
      const friday = new Date("2026-11-06T09:00:00Z");
      await service.updateCajas({ id: row!.id, created_at: friday } as never);
      process.env.CAJA_FESTIVOS = "2026-11-09";
      const at = (iso: string) => processCajas(container, new Date(iso));
      expect((await at("2026-11-10T09:00:00Z")).alerts).toBe(0); // martes: 14 + 0 + 24 = 38 h
      expect((await at("2026-11-11T09:00:00Z")).alerts).toBe(1); // miércoles: 62 h ≥ 48
      expect((await at("2026-11-12T09:00:00Z")).alerts).toBe(0); // una sola vez
      for (let i = 0; i < 50 && !sent.some((m) => m.template === "caja-tienda"); i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      expect(sent.find((m) => m.template === "caja-tienda")!.data).toMatchObject({
        kind: "sin_preparar",
        name: "Toby",
      });
    });
  },
});
