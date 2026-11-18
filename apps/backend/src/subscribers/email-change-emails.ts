import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { EMAIL_CHANGE_TTL_HOURS } from "../lib/email-change";
import { maskEmail } from "../lib/guest-orders";
import {
  EMAIL_CHANGE_REQUESTED,
  EMAIL_CHANGED,
  type EmailChangeRequestedData,
  type EmailChangedData,
} from "../workflows/email-change";
import { emailEnabled, hashKey, linksFrom, sendEmail } from "./_email";

/**
 * Cambio de email (fase 13 punto 8):
 * - `customer.email_change_requested` → al email NUEVO, el enlace `/cuenta/email/?token=…`.
 * - `customer.email_changed` → aviso al email ANTIGUO (con el nuevo enmascarado).
 * Nunca se registran el token ni los emails (claves de idempotencia con hash).
 */
export default async function emailChangeEmails({
  event: { name, data },
  container,
}: SubscriberArgs<EmailChangeRequestedData | EmailChangedData>) {
  if (!emailEnabled()) return;
  const links = linksFrom(container);
  if (name === EMAIL_CHANGE_REQUESTED) {
    const d = data as EmailChangeRequestedData;
    await sendEmail(container, {
      to: d.new_email,
      template: "email-change",
      data: {
        ...links,
        confirmUrl: `${links.storefrontUrl}/cuenta/email/?token=${encodeURIComponent(d.token)}`,
        expiresInHours: EMAIL_CHANGE_TTL_HOURS,
      },
      idempotencyKey: hashKey("email-change", d.token),
    });
    return;
  }
  const d = data as EmailChangedData;
  await sendEmail(container, {
    to: d.old_email,
    template: "email-changed",
    data: { ...links, firstName: d.first_name, newEmail: maskEmail(d.new_email) },
    idempotencyKey: hashKey("email-changed", `${d.customer_id}/${d.new_email}`),
  });
}

export const config: SubscriberConfig = { event: [EMAIL_CHANGE_REQUESTED, EMAIL_CHANGED] };
