import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { POINTS_MODULE } from "../modules/points";
import type PointsModuleService from "../modules/points/service";
import { orderAdjustments, REF, redeemedForReturned, refundRedeemedOnReturn } from "../lib/points";
import { orderPoints, ORDER_POINTS_FIELDS } from "../lib/points-accrue";
import { toNumber } from "../lib/numeric";
import { pointsMovementWorkflow } from "../workflows/points";

/**
 * Devolución recibida (Fase L-2, K5). Si el pedido YA se abonó, retira la diferencia entre lo
 * abonado y lo que generaría ahora (con lo devuelto descontado), sin dejar el saldo negativo. Si
 * aún no se abonó, nada: el job calculará sobre lo que quede. Idempotente por devolución
 * (`return` + return_id).
 *
 * Fase 13 (P2, plan en docs/fases/faseL-deseos-puntos.md §6.4): además devuelve la parte de los
 * puntos CANJEADOS en el pedido que corresponde a lo devuelto (`redeemedForReturned`: por línea,
 * proporcional a las unidades recibidas; todo si se devuelve todo), menos lo ya devuelto en
 * devoluciones anteriores. Abono `return_redeem` + return_id (idempotente), con
 * `metadata.order_id`. Interruptor `POINTS_REFUND_REDEEMED_ON_RETURN` (activo salvo `false`).
 */
export default async function pointsReturnReceived(
  args: SubscriberArgs<{ order_id: string; return_id: string }>,
) {
  // Independientes: si uno falla, el otro se hace igual (y el evento se reintenta).
  await refundRedeemed(args);
  await takeBackAccrued(args);
}

/** Devuelve la parte de lo canjeado que corresponde a lo devuelto (fase 13). */
async function refundRedeemed({
  event: { data },
  container,
}: SubscriberArgs<{ order_id: string; return_id: string }>) {
  if (!refundRedeemedOnReturn(process.env.POINTS_REFUND_REDEEMED_ON_RETURN)) return;
  const service = container.resolve<PointsModuleService>(POINTS_MODULE);
  const [redeem] = await service.listPointsTransactions({
    reference: REF.redeem,
    reference_id: data.order_id,
    type: "debit",
  });
  if (!redeem) return;
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const {
    data: [order],
  } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "customer_id",
      "items.id",
      "items.quantity",
      "items.detail.return_received_quantity",
    ],
    filters: { id: data.order_id },
  });
  if (!order?.customer_id) return;
  // Los ajustes, aparte: con `items.detail` en la misma consulta Medusa no carga la versión de la
  // línea y `items.adjustments.*` falla («Item version is required», @medusajs/order 2.22.7).
  const adjustments = await orderAdjustments(container, data.order_id);
  const items = (order.items ?? []).map((i) => ({
    ...i,
    adjustments: adjustments.get(i!.id) ?? [],
  }));
  const previous = await service.listPointsTransactions({
    reference: REF.returnRedeem,
    type: "credit",
    metadata: { order_id: data.order_id },
  } as never);
  const already = previous.reduce((acc, t) => acc + toNumber(t.amount as never), 0);
  const redeemed = toNumber(redeem.amount as never);
  const due = Math.min(redeemed, redeemedForReturned(items as never)) - already;
  if (!(due > 0)) return;
  await pointsMovementWorkflow(container).run({
    input: {
      customer_id: order.customer_id,
      type: "credit",
      amount: due,
      reference: REF.returnRedeem,
      reference_id: data.return_id,
      metadata: { order_id: data.order_id },
    },
  });
}

/** Retira lo abonado de más por lo devuelto (Fase L-2, K5). */
async function takeBackAccrued({
  event: { data },
  container,
}: SubscriberArgs<{ order_id: string; return_id: string }>) {
  const service = container.resolve<PointsModuleService>(POINTS_MODULE);
  const [credit] = await service.listPointsTransactions({
    reference: REF.order,
    reference_id: data.order_id,
    type: "credit",
  });
  if (!credit) return;
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const {
    data: [order],
  } = await query.graph({
    entity: "order",
    fields: ORDER_POINTS_FIELDS,
    filters: { id: data.order_id },
  });
  if (!order?.customer_id) return;
  // Lo ya retirado por devoluciones anteriores de este pedido (cada una con su return_id).
  const previous = await service.listPointsTransactions({
    reference: REF.return,
    type: "debit",
    metadata: { order_id: data.order_id },
  } as never);
  const alreadyTaken = previous.reduce((acc, t) => acc + toNumber(t.amount as never), 0);
  const due = toNumber(credit.amount as never) - orderPoints(order as never) - alreadyTaken;
  if (!(due > 0)) return;
  await pointsMovementWorkflow(container).run({
    input: {
      customer_id: order.customer_id,
      type: "debit",
      amount: due,
      reference: REF.return,
      reference_id: data.return_id,
      clampToBalance: true,
      metadata: { order_id: data.order_id },
    },
  });
}

export const config: SubscriberConfig = { event: "order.return_received" };
