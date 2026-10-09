import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { RESET_TTL_MINUTES, resetUrl } from "../lib/emails";
import { emailEnabled, hashKey, linksFrom, sendEmail } from "./_email";

/**
 * Restablecer contraseña (fase 8, opción b): `auth.password_reset` con `{ entity_id, token,
 * actor_type }`. Con `emailpass`, `entity_id` es el email. El token (JWT) caduca a los 15 min
 * (core-flows 2.21.2, `generateResetPasswordTokenWorkflow`).
 * - Cliente → página del storefront `/cuenta/restablecer/` (se crea en la fase 9).
 * - Usuario del Admin → `<backend><admin.path>/reset-password?token=` (la que lee el Admin).
 * Fuente: context7 /medusajs/medusa (Send Reset Password Email Notification).
 * El token NUNCA se registra en logs.
 */
export default async function passwordResetEmail({
  event: { data },
  container,
}: SubscriberArgs<{ entity_id: string; token: string; actor_type: string }>) {
  if (!emailEnabled()) return;
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  if (!data.entity_id?.includes("@")) {
    logger.warn(
      `password-reset-email: identificador no es un email (${data.actor_type}); no se envía`,
    );
    return;
  }
  const config = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE);
  const links = linksFrom(container);
  const backendUrl =
    config.admin?.backendUrl && config.admin.backendUrl !== "/"
      ? config.admin.backendUrl.replace(/\/+$/, "")
      : "http://localhost:9000";

  await sendEmail(container, {
    to: data.entity_id,
    template: "password-reset",
    data: {
      ...links,
      resetUrl: resetUrl(data.actor_type, data.token, {
        storefrontUrl: links.storefrontUrl,
        backendUrl,
        adminPath: config.admin?.path ?? "/app",
      }),
      expiresInMinutes: RESET_TTL_MINUTES,
    },
    // Una por token: si se pide otro enlace, es otro email.
    idempotencyKey: hashKey("password-reset", data.token),
  });
}

export const config: SubscriberConfig = {
  event: "auth.password_reset",
};
