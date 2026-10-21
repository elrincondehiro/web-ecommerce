import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { buildOrderPlacedProps, ORDER_EMAIL_FIELDS, type OrderLike } from "../lib/emails";
import { findAccountByEmail } from "../lib/guest-orders-link";
import { emailEnabled, linksFrom, sendEmail } from "./_email";

/**
 * Confirmación de pedido (fase 8; previsto en fase 5 §8). Corre en el worker.
 * Fuente: context7 /medusajs/medusa (subscriber `order.placed` + `createNotifications`).
 */
export default async function orderPlacedEmail({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  if (!emailEnabled()) return;
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

  const {
    data: [order],
  } = await query.graph({
    entity: "order",
    fields: [...ORDER_EMAIL_FIELDS],
    filters: { id: data.id },
  });
  if (!order?.email) {
    logger.warn(`order-placed-email: pedido ${data.id} sin email; no se envía`);
    return;
  }

  // Fase G-1 (C1): un cliente con cuenta que compra sin entrar puede tener el pedido aún en su
  // ficha de invitado (lo pasa a la cuenta otro subscriber, en paralelo). Si hay una cuenta con
  // ese email, el email ya se escribe como para la cuenta (puntos que ganará, enlace al pedido).
  const hasAccount =
    Boolean(order.customer?.has_account) ||
    Boolean(await findAccountByEmail(container, order.email));
  const props = { ...(order as unknown as OrderLike), customer: { has_account: hasAccount } };

  await sendEmail(container, {
    to: order.email,
    template: "order-placed",
    data: buildOrderPlacedProps(props, linksFrom(container)),
    idempotencyKey: `order-placed/${order.id}`,
  });
}

export const config: SubscriberConfig = {
  event: "order.placed",
};
