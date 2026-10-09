import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import {
  ACCOUNT_DELETION_REQUESTED,
  type AccountDeletionRequestedData,
} from "../workflows/request-account-deletion";
import { emailEnabled, linksFrom, sendEmail } from "./_email";

/**
 * Solicitud de baja (fase 9): avisa a la tienda (`SHOP_NOTIFY_EMAIL`), que la tramita a mano.
 * Sin SHOP_NOTIFY_EMAIL no se envía (aviso en el log, sin datos del cliente).
 */
export default async function accountDeletionRequestedEmail({
  event: { data },
  container,
}: SubscriberArgs<AccountDeletionRequestedData>) {
  if (!emailEnabled()) return;
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const to = process.env.SHOP_NOTIFY_EMAIL;
  if (!to) {
    logger.warn("account-deletion: falta SHOP_NOTIFY_EMAIL; no se avisa de la solicitud de baja");
    return;
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const {
    data: [customer],
  } = await query.graph({
    entity: "customer",
    fields: ["id", "email"],
    filters: { id: data.customer_id },
  });
  if (!customer?.email) return;

  await sendEmail(container, {
    to,
    template: "account-deletion-request",
    data: {
      ...linksFrom(container),
      customerId: customer.id,
      customerEmail: customer.email,
      requestedAt: data.requested_at,
      reason: data.reason,
    },
    // Una por solicitud (el cliente puede repetirla: cada una es un aviso).
    idempotencyKey: `account-deletion/${customer.id}/${data.requested_at}`,
  });
}

export const config: SubscriberConfig = {
  event: ACCOUNT_DELETION_REQUESTED,
};
