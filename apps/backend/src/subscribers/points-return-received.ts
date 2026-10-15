import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { POINTS_MODULE } from "../modules/points";
import type PointsModuleService from "../modules/points/service";
import { REF } from "../lib/points";
import { orderPoints, ORDER_POINTS_FIELDS } from "../lib/points-accrue";
import { toNumber } from "../lib/numeric";
import { pointsMovementWorkflow } from "../workflows/points";

/**
 * Devolución recibida (Fase L-2, K5). Si el pedido YA se abonó, retira la diferencia entre lo
 * abonado y lo que generaría ahora (con lo devuelto descontado), sin dejar el saldo negativo. Si
 * aún no se abonó, nada: el job calculará sobre lo que quede. Idempotente por devolución
 * (`return` + return_id). Los puntos CANJEADOS en un pedido devuelto los decide la tienda
 * (ajuste manual; automatizarlo: plan en docs/fases/faseL-deseos-puntos.md §6.4).
 */
export default async function pointsReturnReceived({
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
