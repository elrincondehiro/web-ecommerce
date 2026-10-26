import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { cancelOrderWorkflow } from "@medusajs/medusa/core-flows";
import {
  accountOrderUrl,
  orderPaymentMethod,
  orderTransferInfo,
  ORDER_EMAIL_FIELDS,
  type OrderLike,
} from "./emails";
import { TRANSFER_PROVIDER_ID, transferConfig, transferStage } from "./transfer";
import { emailEnabled, linksFrom, sendEmail } from "../subscribers/_email";

/**
 * Pedidos por transferencia sin pagar (Fase PG-3), job diario `transfer-orders`:
 * - último día del plazo → recordatorio (una vez: idempotency_key por pedido);
 * - después → `cancelOrderWorkflow` (libera stock, devuelve puntos y códigos por sus subscribers
 *   de `order.canceled`; el pago manual se cancela sin llamar a nadie) y email de cancelación.
 * «Sin pagar» = pago del proveedor manual sin capturar. Capturarlo en el Admin = pagado.
 * Fuente: context7 /medusajs/medusa (scheduled jobs; cancelOrderWorkflow).
 */
export async function processTransferOrders(
  container: MedusaContainer,
  now = new Date(),
): Promise<{ reminded: number; canceled: number }> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { days } = transferConfig();
  // Pedidos abiertos con un pago manual sin capturar (como mucho los de los últimos 30 días).
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const { data: orders } = await query.graph({
    entity: "order",
    fields: [...ORDER_EMAIL_FIELDS, "status", "canceled_at"],
    filters: { status: "pending", created_at: { $gte: since } },
  });
  let reminded = 0;
  let canceled = 0;
  const links = linksFrom(container);
  for (const raw of orders) {
    const order = raw as unknown as OrderLike & { id: string; email?: string | null };
    const info = orderPaymentMethod(order);
    if (!info?.transfer || info.captured) continue;
    const payments = (order.payment_collections ?? []).flatMap((c) => c?.payments ?? []);
    if (!payments.some((p) => p?.provider_id === TRANSFER_PROVIDER_ID)) continue;
    const stage = transferStage(order.created_at ?? now, now, days);
    if (stage === "wait") continue;
    const transfer = orderTransferInfo(order);
    try {
      if (stage === "cancel") {
        await cancelOrderWorkflow(container).run({
          input: { order_id: order.id, canceled_by: "transfer-orders" },
        });
        canceled++;
      } else {
        reminded++;
      }
      if (emailEnabled() && order.email && transfer) {
        await sendEmail(container, {
          to: order.email,
          template: "transfer-reminder",
          data: {
            ...links,
            kind: stage === "cancel" ? "canceled" : "remind",
            displayId: order.display_id ?? order.id,
            customerName: order.shipping_address?.first_name?.trim() || null,
            transfer,
            orderUrl: order.customer?.has_account
              ? accountOrderUrl(links.storefrontUrl, order.id)
              : null,
          },
          idempotencyKey: `transfer-${stage}/${order.id}`,
        });
      }
    } catch (err) {
      logger.warn(`transfer-orders: pedido ${order.id}: ${(err as Error).message}`);
    }
  }
  if (reminded || canceled) {
    logger.info(`transfer-orders: ${reminded} recordatorios, ${canceled} pedidos cancelados`);
  }
  return { reminded, canceled };
}
