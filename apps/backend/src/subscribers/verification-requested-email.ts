import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { minutesUntil, verifyUrl } from "../lib/emails";
import { emailEnabled, hashKey, linksFrom, sendEmail } from "./_email";

/**
 * Confirmar email al registrarse (fase 8, opción b; el registro "pendiente" se activa en la
 * fase 9 con `http.authVerificationsPerActor.customer`). Evento `auth.verification_requested`
 * (core-flows 2.21.2, `requestVerificationWorkflow`): `{ entity_id, entity_type, code,
 * expires_at, … }`. El storefront confirma con `POST /auth/verification/confirm { code }`, así que
 * el enlace solo lleva el código (sin el email en la URL).
 * Fuente: context7 /medusajs/medusa (commerce-modules/auth/email-verification).
 * El código NUNCA se registra en logs.
 */
export default async function verificationRequestedEmail({
  event: { data },
  container,
}: SubscriberArgs<{
  entity_id: string;
  entity_type: string;
  code: string;
  expires_at?: string;
}>) {
  if (!emailEnabled() || data.entity_type !== "email") return;
  const links = linksFrom(container);
  await sendEmail(container, {
    to: data.entity_id,
    template: "verify-email",
    data: {
      ...links,
      verifyUrl: verifyUrl(links.storefrontUrl, data.code),
      expiresInMinutes: minutesUntil(data.expires_at),
    },
    idempotencyKey: hashKey("verify-email", data.code),
  });
}

export const config: SubscriberConfig = {
  event: "auth.verification_requested",
};
