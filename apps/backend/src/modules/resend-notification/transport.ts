import type { Logger } from "@medusajs/framework/types";
import { MedusaError } from "@medusajs/framework/utils";
import { Resend } from "resend";

/**
 * Transportes de email del proveedor (fase 8):
 *   - `resend`: API de Resend (producción y pruebas con el dominio verificado).
 *   - `smtp`: Mailpit en desarrollo (SMTP :1025). `nodemailer` es devDependency: se carga con
 *     `import()` solo en este modo y no entra en la imagen de producción.
 * Fuentes: MCP resend-docs (send-with-nodejs: `html` + `text`, `idempotencyKey`, 24 h) y
 * README de nodemailer 10 (`createTransport`, `sendMail`).
 */
export type EmailTransportName = "resend" | "smtp";

export type OutgoingEmail = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string | undefined;
  /** Evita duplicados en reintentos (Resend: 24 h). */
  idempotencyKey?: string | undefined;
};

export type EmailTransport = {
  send(email: OutgoingEmail): Promise<{ id?: string }>;
};

export type TransportOptions = {
  transport: EmailTransportName;
  apiKey?: string | undefined;
  smtpHost?: string | undefined;
  smtpPort?: number | undefined;
};

export function createResendTransport(apiKey: string): EmailTransport {
  const client = new Resend(apiKey);
  return {
    async send(email) {
      const { data, error } = await client.emails.send(
        {
          from: email.from,
          to: [email.to],
          subject: email.subject,
          html: email.html,
          text: email.text,
          ...(email.replyTo ? { replyTo: email.replyTo } : {}),
        },
        email.idempotencyKey ? { idempotencyKey: email.idempotencyKey } : undefined,
      );
      if (error || !data) {
        // Sin datos del destinatario ni del contenido en el mensaje (AGENTS §7.1).
        throw new MedusaError(
          MedusaError.Types.UNEXPECTED_STATE,
          `Resend rechazó el email: ${error?.name ?? "error desconocido"} · ${error?.message ?? ""}`,
        );
      }
      return { id: data.id };
    },
  };
}

export function createSmtpTransport(host: string, port: number): EmailTransport {
  let transporter: import("nodemailer").Transporter | undefined;
  return {
    async send(email) {
      if (!transporter) {
        const nodemailer = await import("nodemailer");
        transporter = nodemailer.createTransport({ host, port, secure: false });
      }
      const info = await transporter.sendMail({
        from: email.from,
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
        ...(email.replyTo ? { replyTo: email.replyTo } : {}),
      });
      return { id: info.messageId };
    },
  };
}

export function createTransport(options: TransportOptions, logger: Logger): EmailTransport {
  if (options.transport === "resend") {
    if (!options.apiKey) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Falta RESEND_API_KEY");
    }
    return createResendTransport(options.apiKey);
  }
  if (options.transport === "smtp") {
    if (process.env.NODE_ENV === "production") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "EMAIL_TRANSPORT=smtp es solo para desarrollo (Mailpit); en producción usa resend",
      );
    }
    const host = options.smtpHost ?? "localhost";
    const port = options.smtpPort ?? 1025;
    logger.info(`Emails por SMTP (desarrollo) en ${host}:${port}`);
    return createSmtpTransport(host, port);
  }
  throw new MedusaError(
    MedusaError.Types.INVALID_DATA,
    `EMAIL_TRANSPORT no válido: ${String(options.transport)} (resend | smtp)`,
  );
}
