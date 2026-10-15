import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { POINTS_MODULE } from "../modules/points";
import type PointsModuleService from "../modules/points/service";
import { REF } from "../lib/points";
import { toNumber } from "../lib/numeric";
import { pointsMovementWorkflow } from "../workflows/points";

/**
 * Pedido cancelado (Fase L-2, K5): devuelve los puntos canjeados en él (abono `order_canceled`
 * por el mismo importe; idempotente). No hay abono que retirar: el job no abona pedidos
 * cancelados. Fuente: context7 /medusajs/medusa (subscriber de `order.canceled`).
 */
export default async function pointsOrderCanceled({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const service = container.resolve<PointsModuleService>(POINTS_MODULE);
  const [redeem] = await service.listPointsTransactions(
    { reference: REF.redeem, reference_id: data.id, type: "debit" },
    { relations: ["account"] },
  );
  if (!redeem) return;
  await pointsMovementWorkflow(container).run({
    input: {
      customer_id: redeem.account.customer_id,
      type: "credit",
      amount: toNumber(redeem.amount as never),
      reference: REF.canceled,
      reference_id: data.id,
    },
  });
}

export const config: SubscriberConfig = { event: "order.canceled" };
