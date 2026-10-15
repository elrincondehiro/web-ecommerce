import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { pointsMovementWorkflow } from "../workflows/points";
import { POINTS_MODULE } from "../modules/points";
import type PointsModuleService from "../modules/points/service";
import {
  REF,
  accrualBase,
  consolidateDays,
  isConsolidated,
  pointsFor,
  type AccrualItem,
  type FulfillmentLike,
} from "./points";

/**
 * Abono de puntos (Fase L-2, K1/P1): pedidos de clientes con cuenta, sin cancelar, cuyo ÚLTIMO
 * envío fue hace ≥ POINTS_CONSOLIDATE_DAYS días, y que aún no tienen abono. Base: líneas con IVA
 * tras descuentos (incluido el de puntos), sin envío, sin `sin_puntos`, netas de lo devuelto
 * (Medusa ya baja el total de la línea al recibir una devolución). Idempotente (índice único reference + reference_id + type). Lo ejecuta el
 * job diario `points-accrue` (worker) y `pnpm --filter backend points:accrue`.
 */
const PAGE = 100;
/** Ventana de búsqueda: pedidos de los últimos N días (más que el plazo de cualquier envío). */
const LOOKBACK_DAYS = 120;
const DAY_MS = 24 * 60 * 60 * 1000;

// `total` / `item_total` del pedido: sin ellos Query no calcula los totales de las líneas
// (`items.total` no llega; comprobado en 2.21.2).
export const ORDER_POINTS_FIELDS = [
  "id",
  "total",
  "item_total",
  "status",
  "canceled_at",
  "customer_id",
  "customer.has_account",
  "items.total",
  "items.product.metadata",
  "items.variant.product.metadata",
  "fulfillments.shipped_at",
  "fulfillments.canceled_at",
];

type OrderForPoints = {
  id: string;
  status?: string | null;
  canceled_at?: unknown;
  customer_id?: string | null;
  customer?: { has_account?: boolean | null } | null;
  items?: AccrualItem[] | null;
  fulfillments?: FulfillmentLike[] | null;
};

/**
 * Puntos que genera un pedido. `items.total` ya es NETO de lo devuelto y recibido: tras recibir
 * una devolución Medusa 2.21.2 baja el total de la línea (comprobado en el test de puntos: 70 €
 * devueltos → total 0 y `return_received_total` 70). No se resta otra vez.
 */
export function orderPoints(order: OrderForPoints): number {
  return pointsFor(accrualBase(order.items));
}

export async function accruePoints(
  container: MedusaContainer,
  now = new Date(),
): Promise<{ checked: number; credited: number }> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const service = container.resolve<PointsModuleService>(POINTS_MODULE);
  const days = consolidateDays(process.env.POINTS_CONSOLIDATE_DAYS);
  const since = new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS);
  let checked = 0;
  let credited = 0;
  for (let skip = 0; ; skip += PAGE) {
    const { data } = await query.graph({
      entity: "order",
      fields: ORDER_POINTS_FIELDS,
      filters: { created_at: { $gte: since }, customer_id: { $ne: null } } as never,
      pagination: { skip, take: PAGE, order: { created_at: "ASC" } },
    });
    const orders = data as unknown as OrderForPoints[];
    if (!orders.length) break;
    const ready = orders.filter(
      (o) => o.customer_id && o.customer?.has_account && isConsolidated(o, now, days),
    );
    checked += ready.length;
    const done = new Set(
      (
        await service.listPointsTransactions(
          { reference: REF.order, type: "credit", reference_id: ready.map((o) => o.id) },
          { select: ["reference_id"] },
        )
      ).map((t) => t.reference_id),
    );
    for (const order of ready) {
      if (done.has(order.id)) continue;
      const amount = orderPoints(order);
      if (!(amount > 0)) continue;
      try {
        const { result } = await pointsMovementWorkflow(container).run({
          input: {
            customer_id: order.customer_id!,
            type: "credit",
            amount,
            reference: REF.order,
            reference_id: order.id,
          },
        });
        if (result.created) credited++;
      } catch (err) {
        // Sin datos personales: solo el pedido y el mensaje.
        logger.error(`points-accrue: pedido ${order.id}: ${(err as Error).message}`);
      }
    }
    if (orders.length < PAGE) break;
  }
  if (credited) logger.info(`points-accrue: ${credited} pedidos abonados`);
  return { checked, credited };
}
