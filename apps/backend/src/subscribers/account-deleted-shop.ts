import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { ACCOUNT_DELETED, type AccountDeletedData } from "../workflows/delete-account";
import { emailEnabled, linksFrom, sendEmail } from "./_email";

/**
 * Baja de una cuenta (fase 13): aviso INTERNO a la tienda (`SHOP_NOTIFY_EMAIL`) con el id, la
 * fecha, el motivo y desde dónde se hizo. Sin el email del cliente (ya está anonimizado).
 */
export default async function accountDeletedShop({
  event: { data },
  container,
}: SubscriberArgs<AccountDeletedData>) {
  if (!emailEnabled()) return;
  const to = process.env.SHOP_NOTIFY_EMAIL;
  if (!to) {
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn("account-deleted: falta SHOP_NOTIFY_EMAIL; no se avisa de la baja");
    return;
  }
  await sendEmail(container, {
    to,
    template: "account-deleted-shop",
    data: {
      ...linksFrom(container),
      customerId: data.customer_id,
      deletedAt: data.deleted_at,
      reason: data.reason,
      via: data.via,
    },
    idempotencyKey: `account-deleted-shop/${data.customer_id}`,
  });
}

export const config: SubscriberConfig = { event: ACCOUNT_DELETED };
