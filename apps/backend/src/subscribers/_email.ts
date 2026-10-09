import { createHash } from "node:crypto";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import type { TemplateId, TemplateProps } from "emails";
import { emailLinks } from "../lib/emails";

/**
 * Utilidades comunes de los subscribers de email (fase 8). El guion bajo evita que Medusa lo
 * cargue como subscriber (no exporta `config`).
 */

/** Sin EMAIL_TRANSPORT no hay proveedor del canal `email` (CI, tests): no se envía nada. */
export const emailEnabled = () => Boolean(process.env.EMAIL_TRANSPORT);

export function linksFrom(container: MedusaContainer) {
  const config = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE);
  return emailLinks(config.admin?.storefrontUrl, process.env.EMAIL_ASSETS_URL);
}

/** Clave de idempotencia corta y sin datos personales (Resend: ≤ 256 caracteres). */
export const hashKey = (prefix: string, value: string) =>
  `${prefix}/${createHash("sha256").update(value).digest("hex").slice(0, 32)}`;

/**
 * Envía un email por el Notification Module. Con `idempotency_key`, Medusa no lo reenvía si ya
 * salió bien (solo reintenta los fallidos) y el proveedor la pasa a Resend.
 * Los errores se registran sin destinatario ni contenido (AGENTS §7.1).
 */
export async function sendEmail<T extends TemplateId>(
  container: MedusaContainer,
  args: { to: string; template: T; data: TemplateProps[T]; idempotencyKey: string },
): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const notifications = container.resolve(Modules.NOTIFICATION);
  try {
    await notifications.createNotifications({
      to: args.to,
      channel: "email",
      template: args.template,
      data: args.data as unknown as Record<string, unknown>,
      idempotency_key: args.idempotencyKey,
    });
  } catch (err) {
    logger.error(
      `No se pudo enviar el email "${args.template}" (${args.idempotencyKey}): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}
