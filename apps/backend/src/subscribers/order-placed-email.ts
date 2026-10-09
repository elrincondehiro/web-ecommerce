import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { buildOrderPlacedProps, ORDER_EMAIL_FIELDS, type OrderLike } from "../lib/emails";
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

  await sendEmail(container, {
    to: order.email,
    template: "order-placed",
    data: buildOrderPlacedProps(order as unknown as OrderLike, linksFrom(container)),
    idempotencyKey: `order-placed/${order.id}`,
  });
}

export const config: SubscriberConfig = {
  event: "order.placed",
};
