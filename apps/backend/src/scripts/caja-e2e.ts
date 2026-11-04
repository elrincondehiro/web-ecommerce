import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { capturePaymentWorkflow } from "@medusajs/medusa/core-flows";
import { randomBytes } from "node:crypto";

/**
 * e2e de la caja de snacks (Fase CS-4) — solo desarrollo. Hace lo que la tienda hace en el Admin
 * con un pedido de prueba (`…@example.com`): captura el pago, llena cada caja (snacks con stock
 * hasta lo pagado) y la propone. Va por las RUTAS del Admin del backend en marcha
 * (`MEDUSA_BACKEND_URL`, por defecto :9000): desde `medusa exec` el evento `caja.propuesta` no
 * llegaría a nadie (event-bus-redis 2.22.2 solo encola eventos con subscribers en el proceso que
 * emite, y `medusa exec` no los carga), así que el email no saldría.
 * Usuario de Admin temporal (se borra al terminar).
 *
 *   pnpm --filter backend caja:e2e <order_id>
 *
 * Se niega con NODE_ENV=production o con un pedido que no sea de prueba. El log no lleva emails.
 */
export default async function cajaE2e({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  if (process.env.NODE_ENV === "production") throw new Error("caja:e2e es solo para desarrollo.");
  const orderId = (args ?? [])[0] ?? "";
  const base = (process.env.MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/+$/, "");
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "email",
      "payment_collections.payments.id",
      "payment_collections.payments.captured_at",
    ],
    filters: { id: orderId },
  });
  const order = data[0] as
    | {
        email?: string | null;
        payment_collections?: { payments?: { id: string; captured_at?: unknown }[] }[];
      }
    | undefined;
  if (!order || !/@example\.com$/i.test(order.email ?? "")) {
    throw new Error("caja:e2e: pedido no encontrado o no es de prueba (@example.com).");
  }
  for (const pc of order.payment_collections ?? []) {
    for (const p of pc.payments ?? []) {
      if (!p.captured_at) {
        await capturePaymentWorkflow(container).run({ input: { payment_id: p.id } });
      }
    }
  }

  // Usuario de Admin temporal
  const email = `caja-e2e-${randomBytes(4).toString("hex")}@example.com`;
  const password = randomBytes(18).toString("base64url");
  const users = container.resolve(Modules.USER);
  const auth = container.resolve(Modules.AUTH);
  const user = await users.createUsers({ email });
  const { authIdentity } = await auth.register("emailpass", {
    body: { email, password },
  } as never);
  try {
    await auth.updateAuthIdentities({ id: authIdentity!.id, app_metadata: { user_id: user.id } });
    const login = await fetch(`${base}/auth/user/emailpass`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const { token } = (await login.json()) as { token: string };
    const api = async (path: string, body?: unknown) => {
      const r = await fetch(`${base}${path}`, {
        method: body ? "POST" : "GET",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      if (!r.ok) throw new Error(`caja:e2e: ${path} → ${r.status} ${String(json.message ?? "")}`);
      return json;
    };
    type View = { line_item_id: string; editable: boolean; paid: number };
    type Snack = { variant_id: string; price: number; step_g: number | null; available: number };
    const info = (await api(`/admin/orders/${orderId}/cajas`)) as {
      cajas: View[];
      snacks: Snack[];
    };
    const snack = info.snacks.find((s) => !s.step_g && (s.available ?? 0) >= 5);
    if (!snack) throw new Error("caja:e2e: no hay snacks con stock");
    for (const c of info.cajas.filter((c) => c.editable)) {
      const quantity = Math.min(20, Math.ceil(c.paid / snack.price));
      await api(`/admin/orders/${orderId}/cajas/${c.line_item_id}`, {
        items: [{ variant_id: snack.variant_id, quantity }],
      });
    }
    const res = (await api(`/admin/orders/${orderId}/cajas/proponer`, {})) as { count: number };
    logger.info(`caja:e2e: ${res.count} caja(s) propuesta(s) en ${orderId}`);
  } finally {
    await users.deleteUsers([user.id]);
    await auth.deleteAuthIdentities([authIdentity!.id]);
  }
}
