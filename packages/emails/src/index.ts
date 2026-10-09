import { createElement } from "react";
import { render } from "react-email";
import * as orderPlaced from "./order-placed";
import * as orderShipped from "./order-shipped";
import * as passwordReset from "./password-reset";
import * as verifyEmail from "./verify-email";

export type { EmailLinks } from "./_components/Layout";
export type { EmailAddress, EmailLineItem } from "./_lib/types";
export { buildTaxBreakdown, type TaxableLine, type TaxBreakdownRow } from "./_lib/tax";
export type { OrderPlacedProps } from "./order-placed";
export type { OrderShippedProps, TrackingInfo } from "./order-shipped";
export type { PasswordResetProps } from "./password-reset";
export type { VerifyEmailProps } from "./verify-email";

/** Plantillas disponibles: el id es el `template` de `createNotifications`. */
const templates = {
  "order-placed": orderPlaced,
  "order-shipped": orderShipped,
  "password-reset": passwordReset,
  "verify-email": verifyEmail,
} as const;

export type TemplateId = keyof typeof templates;

export type TemplateProps = {
  "order-placed": orderPlaced.OrderPlacedProps;
  "order-shipped": orderShipped.OrderShippedProps;
  "password-reset": passwordReset.PasswordResetProps;
  "verify-email": verifyEmail.VerifyEmailProps;
};

export const TEMPLATE_IDS = Object.keys(templates) as TemplateId[];

export function isTemplateId(value: string): value is TemplateId {
  return Object.hasOwn(templates, value);
}

export type RenderedEmail = { subject: string; html: string; text: string };

/** Renderiza una plantilla a asunto + HTML + texto plano (AGENTS §5: siempre texto plano). */
export async function renderEmail<T extends TemplateId>(
  id: T,
  props: TemplateProps[T],
): Promise<RenderedEmail> {
  const mod = templates[id] as unknown as {
    default: (p: TemplateProps[T]) => React.ReactElement;
    subject: (p: TemplateProps[T]) => string;
  };
  const element = createElement(mod.default, props);
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { subject: mod.subject(props), html, text };
}

/** Props de previsualización de cada plantilla (tests y `email dev`). */
export function previewProps<T extends TemplateId>(id: T): TemplateProps[T] {
  return (templates[id].default as unknown as { PreviewProps: TemplateProps[T] }).PreviewProps;
}
