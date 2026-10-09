import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import {
  buildOrderShippedProps,
  ORDER_EMAIL_FIELDS,
  type FulfillmentLike,
  type OrderLike,
} from "../lib/emails";
import { emailEnabled, linksFrom, sendEmail } from "./_email";

/**
 * Pedido enviado (fase 8). `shipment.created` lleva el id del fulfillment y `no_notification`
 * (casilla "Enviar notificación" del Admin), que se respeta.
 * Fuente: context7 /medusajs/medusa (subscriber `shipment.created`) + core-flows 2.21.2
 * (`createShipmentWorkflow` emite `{ id, no_notification }`); seguimiento en `labels`.
 */
export default async function shipmentCreatedEmail({
  event: { data },
  container,
}: SubscriberArgs<{ id: string; no_notification?: boolean }>) {
  if (!emailEnabled() || data.no_notification) return;
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

  const {
    data: [fulfillment],
  } = await query.graph({
    entity: "fulfillment",
    fields: [
      "id",
      "items.line_item_id",
      "items.quantity",
      "labels.tracking_number",
      "labels.tracking_url",
      ...ORDER_EMAIL_FIELDS.map((f) => `order.${f}`),
    ],
    filters: { id: data.id },
  });
  const order = (fulfillment as { order?: OrderLike | null } | undefined)?.order;
  if (!fulfillment || !order?.email) {
    logger.warn(`shipment-created-email: envío ${data.id} sin pedido o sin email; no se envía`);
    return;
  }

  await sendEmail(container, {
    to: order.email,
    template: "order-shipped",
    data: buildOrderShippedProps(
      order,
      fulfillment as unknown as FulfillmentLike,
      linksFrom(container),
    ),
    idempotencyKey: `order-shipped/${fulfillment.id}`,
  });
}

export const config: SubscriberConfig = {
  event: "shipment.created",
};
