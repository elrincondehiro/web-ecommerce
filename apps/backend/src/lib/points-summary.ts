import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { POINTS_MODULE } from "../modules/points";
import type PointsModuleService from "../modules/points/service";
import { REF, balanceOf, roundCents } from "./points";
import { ORDER_POINTS_FIELDS, orderPoints } from "./points-accrue";
import { toNumber } from "./numeric";
import { earnsPoints, retroactiveEnabled } from "./guest-orders";

/**
 * Resumen de puntos de un cliente (Fase L-2): saldo, pendiente (estimación de los pedidos sin
 * cancelar que aún no se han abonado) y movimientos (los más recientes primero, sin ids internos
 * de cuenta). Lo usan la Store API («Mi cuenta», L-3) y el widget del Admin.
 */
export async function pointsSummary(
  container: MedusaContainer,
  customerId: string,
  page: { limit: number; offset: number } = { limit: 20, offset: 0 },
) {
  const service = container.resolve<PointsModuleService>(POINTS_MODULE);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const account = await service.findAccount(customerId);
  const all = account
    ? await service.listPointsTransactions(
        { account_id: account.id },
        { select: ["type", "amount", "reference", "reference_id"] },
      )
    : [];
  const credited = new Set(all.filter((t) => t.reference === REF.order).map((t) => t.reference_id));
  const { data: orders } = await query.graph({
    entity: "order",
    fields: ORDER_POINTS_FIELDS,
    filters: { customer_id: customerId } as never,
    pagination: { skip: 0, take: 50, order: { created_at: "DESC" } },
  });
  // Fase G-1: con POINTS_RETROACTIVE=false, los pedidos de antes de la cuenta no cuentan.
  const retroactive = retroactiveEnabled(process.env.POINTS_RETROACTIVE);
  type Row = {
    id: string;
    status?: string;
    canceled_at?: unknown;
    created_at?: string | Date | null;
    customer?: { created_at?: string | Date | null } | null;
  };
  const pending = roundCents(
    (orders as unknown as Row[])
      .filter(
        (o) =>
          o.status !== "canceled" &&
          !o.canceled_at &&
          !credited.has(o.id) &&
          earnsPoints(o, o.customer, retroactive),
      )
      .reduce((acc, o) => acc + orderPoints(o as never), 0),
  );
  const [transactions, count] = account
    ? await service.listAndCountPointsTransactions(
        { account_id: account.id },
        {
          select: ["id", "type", "amount", "reference", "reference_id", "note", "created_at"],
          order: { created_at: "DESC" },
          take: page.limit,
          skip: page.offset,
        },
      )
    : [[], 0];
  // Número visible del pedido («Pedido #123» en «Mi cuenta», L-3).
  const orderIds = [
    ...new Set(
      transactions.filter((t) => t.reference.startsWith("order")).map((t) => t.reference_id),
    ),
  ];
  const displayIds = new Map<string, number>();
  if (orderIds.length) {
    const { data: rows } = await query.graph({
      entity: "order",
      fields: ["id", "display_id"],
      filters: { id: orderIds },
    });
    for (const o of rows as { id: string; display_id?: number | null }[]) {
      if (o.display_id) displayIds.set(o.id, o.display_id);
    }
  }
  return {
    balance: balanceOf(all),
    pending,
    transactions: transactions.map((t) => ({
      id: t.id,
      type: t.type,
      amount: toNumber(t.amount as never),
      reference: t.reference,
      // El pedido sí (enlace en «Mi cuenta»); otras referencias, no.
      order_id: t.reference.startsWith("order") ? t.reference_id : null,
      order_display_id: displayIds.get(t.reference_id) ?? null,
      note: t.note,
      created_at: t.created_at,
    })),
    count,
  };
}
