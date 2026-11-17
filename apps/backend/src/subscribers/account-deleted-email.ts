import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { ACCOUNT_DELETED, type AccountDeletedData } from "../workflows/delete-account";
import { anonymizeNotifications } from "../workflows/delete-account/steps";
import { emailEnabled, linksFrom, sendEmail } from "./_email";

/**
 * Baja de la cuenta (fase 13): email de despedida al email que tenía la cuenta y, después,
 * anonimiza también ese email en el historial (`notification`). Sin email (cliente sin cuenta o
 * sin EMAIL_TRANSPORT) no se envía nada.
 */
export default async function accountDeletedEmail({
  event: { data },
  container,
}: SubscriberArgs<AccountDeletedData>) {
  if (!data.email) return;
  if (emailEnabled()) {
    await sendEmail(container, {
      to: data.email,
      template: "account-deleted",
      data: { ...linksFrom(container), firstName: data.first_name },
      idempotencyKey: `account-deleted/${data.customer_id}`,
    });
  }
  try {
    await anonymizeNotifications(container, data.email, data.customer_id);
  } catch (e) {
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn(
        `account-deleted: historial de emails sin anonimizar (${data.customer_id}): ${String(e)}`,
      );
  }
}

export const config: SubscriberConfig = { event: ACCOUNT_DELETED };
