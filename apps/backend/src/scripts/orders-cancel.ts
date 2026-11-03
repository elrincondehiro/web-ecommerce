import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { cancelOrderWorkflow } from "@medusajs/medusa/core-flows";
import { clearMedusaCache } from "./lib/clear-cache";
import { isTestEmail, skipReason, type SkipReason } from "./lib/orders-cancel";

/**
 * Cancela en bloque los pedidos de PRUEBA (`…@example.com`, los de los e2e) — solo desarrollo.
 *
 *   pnpm --filter backend orders:cancel dry-run   # cuenta lo que haría, sin cambiar nada
 *   pnpm --filter backend orders:cancel           # cancela
 *
 * Los e2e de checkout crean pedidos reales en la BD local y sus reservas gastan el stock (las
 * piezas de la correa a medida, que `stock:mock` no repone). Cancelarlos con
 * `cancelOrderWorkflow` (el mismo que el botón del Admin y el job de transferencias) borra sus
 * reservas, cancela los pagos sin capturar y devuelve los capturados (Stripe test) y emite
 * `order.canceled`: los subscribers devuelven los puntos canjeados y los usos de códigos. Sin
 * email de cancelación (no hay plantilla). Salta los completados y los que tienen envíos.
 * Se niega a ejecutarse con NODE_ENV=production. El log solo lleva números de pedido, nunca
 * emails. Fuente: context7 /medusajs/medusa («Cancel an Order») + @medusajs/core-flows 2.22.2
 * (`order/workflows/cancel-order.js`).
 */
const PAGE = 200;

export default async function ordersCancel({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  if (process.env.NODE_ENV === "production") {
    throw new Error("orders:cancel es solo para desarrollo (NODE_ENV=production).");
  }
  const dryRun = (args ?? []).includes("dry-run");
  const prefix = dryRun ? "[dry-run] " : "";
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  // Todos los pedidos sin cancelar, paginados (el filtro del email va en código: sufijo exacto)
  const targets: { id: string; display_id: string | number }[] = [];
  const skipped = new Map<SkipReason, number>();
  for (let skip = 0; ; skip += PAGE) {
    const { data } = await query.graph({
      entity: "order",
      fields: ["id", "display_id", "email", "status", "canceled_at", "fulfillments.canceled_at"],
      filters: { canceled_at: null } as never,
      pagination: { skip, take: PAGE, order: { created_at: "ASC" } },
    });
    // Tipo propio: el generado de Query (`display_id: Maybe<string>`) no encaja con los campos pedidos
    for (const o of data as unknown as {
      id: string;
      display_id: string | number;
      email?: string | null;
      status?: string | null;
      canceled_at?: string | null;
      fulfillments?: { canceled_at?: string | null }[] | null;
    }[]) {
      if (!isTestEmail(o.email)) continue;
      const reason = skipReason(o);
      if (reason) skipped.set(reason, (skipped.get(reason) ?? 0) + 1);
      else targets.push({ id: o.id, display_id: o.display_id });
    }
    if (data.length < PAGE) break;
  }

  const skippedText = [...skipped].map(([r, n]) => `${n} ${r}`).join(", ") || "ninguno";
  logger.info(
    `${prefix}orders:cancel: ${targets.length} pedidos de prueba (@example.com) que cancelar; saltados: ${skippedText}.`,
  );
  if (dryRun || !targets.length) return;

  let canceled = 0;
  const failed: (string | number)[] = [];
  for (const o of targets) {
    try {
      await cancelOrderWorkflow(container).run({
        input: { order_id: o.id, canceled_by: "orders-cancel" },
      });
      canceled++;
      if (canceled % 50 === 0) logger.info(`orders:cancel: ${canceled}/${targets.length}…`);
    } catch (e) {
      failed.push(o.display_id);
      logger.warn(
        `orders:cancel: #${o.display_id} no se ha podido cancelar: ${(e as Error).message}`,
      );
    }
  }
  logger.info(
    `orders:cancel: ${canceled} cancelados${failed.length ? `, ${failed.length} con error (#${failed.join(", #")})` : ""}.`,
  );
  await clearMedusaCache(container);
}
