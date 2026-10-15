import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { customerCodes } from "../lib/codes";
import { toNumber } from "../lib/numeric";

/**
 * Pedido cancelado (Fase P, Q4): devuelve el uso del código descuento (Medusa 2.21.2 no lo hace:
 * `cancelOrderWorkflow` no llama a `revertUsage`, spike P-0). Así un código de un uso (total o por
 * cliente) se puede volver a usar. Idempotente: marca el pedido con `metadata.code_usage_reverted`.
 * Los de puntos (PTS-) no: su devolución es el abono `order_canceled` (points-order-canceled.ts).
 */
export default async function codesOrderCanceled({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: rows } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "email",
      "customer_id",
      "metadata",
      "items.adjustments.code",
      "items.adjustments.amount",
    ],
    filters: { id: data.id },
  });
  const order = rows[0] as unknown as
    | {
        id: string;
        email?: string | null;
        customer_id?: string | null;
        metadata?: Record<string, unknown> | null;
        items?: { adjustments?: { code?: string | null; amount?: unknown }[] | null }[] | null;
      }
    | undefined;
  if (!order || order.metadata?.code_usage_reverted) return;
  const adjustments = (order.items ?? []).flatMap((i) => i.adjustments ?? []);
  const codes = customerCodes(adjustments);
  if (!codes.length) return;
  // Mismo formato que registerUsageStep (completeCartWorkflow): una acción por ajuste.
  const actions = adjustments
    .filter((a) => a.code && codes.includes(a.code))
    .map((a) => ({ code: a.code!, amount: toNumber(a.amount as never) }));
  await container.resolve(Modules.PROMOTION).revertUsage(actions, {
    customer_id: order.customer_id ?? null,
    customer_email: order.email ?? null,
  });
  await container.resolve(Modules.ORDER).updateOrders(order.id, {
    metadata: { ...(order.metadata ?? {}), code_usage_reverted: true },
  });
}

export const config: SubscriberConfig = { event: "order.canceled" };
