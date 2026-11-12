import type {
  Logger,
  ProviderSendNotificationDTO,
  ProviderSendNotificationResultsDTO,
} from "@medusajs/framework/types";
import { AbstractNotificationProviderService, MedusaError } from "@medusajs/framework/utils";
import { isTemplateId, renderEmail, type TemplateProps } from "emails";
import { createTransport, type EmailTransport, type EmailTransportName } from "./transport";

/**
 * Proveedor de notificaciones propio, canal `email` (fase 8, AGENTS §4).
 * Renderiza las plantillas de `packages/emails` (React Email → HTML + texto plano) y envía con
 * Resend o, en desarrollo, por SMTP a Mailpit (`EMAIL_TRANSPORT`).
 * Fuente: context7 /medusajs/medusa (create notification module provider, guía Resend):
 * `AbstractNotificationProviderService`, `identifier`, `validateOptions`, `send()`.
 *
 * `notification.template` = id de plantilla (`order-placed`…) y `notification.data` = sus props.
 * La `idempotency_key` de Medusa se reenvía a Resend como `idempotencyKey`.
 */
export type ResendNotificationOptions = {
  transport: EmailTransportName;
  from: string;
  replyTo?: string;
  apiKey?: string;
  smtpHost?: string;
  smtpPort?: number;
};

type InjectedDependencies = { logger: Logger };

class ResendNotificationProviderService extends AbstractNotificationProviderService {
  static identifier = "resend-notification";

  protected logger_: Logger;
  protected options_: ResendNotificationOptions;
  protected transport_: EmailTransport;

  constructor({ logger }: InjectedDependencies, options: ResendNotificationOptions) {
    super();
    this.logger_ = logger;
    this.options_ = options;
    this.transport_ = createTransport(
      {
        transport: options.transport,
        apiKey: options.apiKey,
        smtpHost: options.smtpHost,
        smtpPort: options.smtpPort,
      },
      logger,
    );
  }

  static validateOptions(options: Record<string, unknown>): void {
    if (!options.from) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Falta la opción `from` (EMAIL_FROM)");
    }
    if (options.transport !== "resend" && options.transport !== "smtp") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "La opción `transport` debe ser resend o smtp (EMAIL_TRANSPORT)",
      );
    }
  }

  async send(
    notification: ProviderSendNotificationDTO,
  ): Promise<ProviderSendNotificationResultsDTO> {
    const { template, to } = notification;
    if (!isTemplateId(template)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Plantilla de email desconocida: ${template}`,
      );
    }
    const props = (notification.data ?? {}) as unknown as TemplateProps[typeof template];
    const { subject, html, text } = await renderEmail(template, props);

    // `idempotency_key` no está en ProviderSendNotificationDTO, pero Medusa pasa la entidad entera.
    const idempotencyKey = (notification as { idempotency_key?: string | null }).idempotency_key;
    const result = await this.transport_.send({
      from: notification.from || this.options_.from,
      to,
      subject,
      html,
      text,
      replyTo: this.options_.replyTo,
      idempotencyKey: idempotencyKey ?? undefined,
      headers: emailHeaders(notification.provider_data),
    });
    // Sin el destinatario en el log (datos personales, AGENTS §7.1).
    this.logger_.info(
      `Email "${template}" enviado (${this.options_.transport}, id ${result.id ?? "?"})`,
    );
    return result.id ? { id: result.id } : {};
  }
}

/**
 * Cabeceras de `provider_data.headers` (Fase MK-A): solo las de baja, para que nadie meta otras
 * por error (`From`, `Bcc`…).
 */
const ALLOWED_HEADERS = new Set(["List-Unsubscribe", "List-Unsubscribe-Post"]);
export function emailHeaders(
  providerData: Record<string, unknown> | null | undefined,
): Record<string, string> | undefined {
  const raw = providerData?.headers;
  if (!raw || typeof raw !== "object") return undefined;
  const entries = Object.entries(raw as Record<string, unknown>).filter(
    (e): e is [string, string] => ALLOWED_HEADERS.has(e[0]) && typeof e[1] === "string",
  );
  return entries.length ? Object.fromEntries(entries) : undefined;
}

export default ResendNotificationProviderService;
