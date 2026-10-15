import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { REF, pointsDiscount } from "../lib/points";
import { pointsMovementWorkflow } from "../workflows/points";

/**
 * Canje de puntos (Fase L-2): al hacer el pedido, carga en la cuenta el DESCUENTO REAL de la
 * promoción de puntos (ajustes del pedido con código PTS-; si el carrito bajó tras aplicarlos,
 * se gasta menos de lo pedido). El saldo se comprobó al completar (hook validate,
 * validar-carrito.ts). Idempotente: un cargo `order_redeem` por pedido.
 */
export default async function pointsOrderPlaced({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const {
    data: [order],
  } = await query.graph({
    entity: "order",
    fields: ["id", "customer_id", "items.adjustments.code", "items.adjustments.amount"],
    filters: { id: data.id },
  });
  if (!order?.customer_id) return;
  const { code, amount } = pointsDiscount(order.items as never);
  if (!code || !(amount > 0)) return;
  await pointsMovementWorkflow(container).run({
    input: {
      customer_id: order.customer_id,
      type: "debit",
      amount,
      reference: REF.redeem,
      reference_id: order.id,
    },
  });
}

export const config: SubscriberConfig = { event: "order.placed" };
