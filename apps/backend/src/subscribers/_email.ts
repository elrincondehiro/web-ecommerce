import { createHash } from "node:crypto";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import type { EmailUnsubscribe, TemplateId, TemplateProps } from "emails";
import { commsTopic, type CommsTopicId } from "../lib/comms";
import { unsubscribeHeaders, unsubscribeUrl } from "../lib/comms-email";
import { unsubscribeToken } from "../lib/comms-token";
import { emailLinks } from "../lib/emails";
import { COMMS_MODULE } from "../modules/comms";
import type CommsModuleService from "../modules/comms/service";

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
  args: {
    to: string;
    template: T;
    data: TemplateProps[T];
    idempotencyKey: string;
    headers?: Record<string, string>;
  },
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
      ...(args.headers ? { provider_data: { headers: args.headers } } : {}),
    });
  } catch (err) {
    logger.error(
      `No se pudo enviar el email "${args.template}" (${args.idempotencyKey}): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

/** Plantillas comerciales: las que aceptan el pie de baja (`unsubscribe`). */
type MarketingTemplateId = {
  [K in TemplateId]: TemplateProps[K] extends { unsubscribe?: EmailUnsubscribe | undefined }
    ? K
    : never;
}[TemplateId];

/**
 * Email COMERCIAL (Fase MK-A): solo si el cliente tiene el tema activo en «Comunicaciones».
 * Añade el pie con la baja y las cabeceras `List-Unsubscribe` (RFC 8058). Devuelve si se envió.
 * Nunca envíes un email comercial con `sendEmail` directamente.
 */
export async function sendMarketingEmail<T extends MarketingTemplateId>(
  container: MedusaContainer,
  args: {
    customerId: string;
    topic: CommsTopicId;
    to: string;
    template: T;
    data: Omit<TemplateProps[T], "unsubscribe">;
    idempotencyKey: string;
  },
): Promise<boolean> {
  const [active] = await container
    .resolve<CommsModuleService>(COMMS_MODULE)
    .listCommsConsents(
      { customer_id: args.customerId, topic: args.topic, revoked_at: null },
      { take: 1 },
    );
  if (!active) return false;
  const links = linksFrom(container);
  const token = unsubscribeToken({ customer_id: args.customerId, topic: args.topic });
  const url = unsubscribeUrl(links.storefrontUrl, token);
  await sendEmail(container, {
    to: args.to,
    template: args.template,
    data: {
      ...args.data,
      unsubscribe: { url, topic: commsTopic(args.topic).title },
    } as unknown as TemplateProps[T],
    idempotencyKey: args.idempotencyKey,
    headers: unsubscribeHeaders(url),
  });
  return true;
}
