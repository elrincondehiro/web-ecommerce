import { createElement } from "react";
import { render } from "react-email";
import * as orderPlaced from "./order-placed";
import * as orderShipped from "./order-shipped";
import * as passwordReset from "./password-reset";
import * as verifyEmail from "./verify-email";
import * as welcome from "./welcome";
import * as accountDeletionRequest from "./account-deletion-request";
import * as orderTransfer from "./order-transfer";
import * as orderReceivedShop from "./order-received-shop";
import * as transferReminder from "./transfer-reminder";
import * as cajaPropuesta from "./caja-propuesta";
import * as cajaTienda from "./caja-tienda";
import * as stockBack from "./stock-back";

export type { EmailLinks, EmailUnsubscribe } from "./_components/Layout";
export type { EmailAddress, EmailLineItem } from "./_lib/types";
export { buildTaxBreakdown, type TaxableLine, type TaxBreakdownRow } from "./_lib/tax";
export type { OrderPlacedProps } from "./order-placed";
export type { OrderShippedProps, TrackingInfo } from "./order-shipped";
export type { PasswordResetProps } from "./password-reset";
export type { VerifyEmailProps } from "./verify-email";
export type { WelcomeProps } from "./welcome";
export type { AccountDeletionRequestProps } from "./account-deletion-request";
export type { OrderTransferProps } from "./order-transfer";
export type { OrderReceivedShopProps, ShopPet } from "./order-received-shop";
export type { TransferReminderProps } from "./transfer-reminder";
export type { TransferInfo } from "./_components/transfer";
export type { CajaPropuestaItem, CajaPropuestaProps } from "./caja-propuesta";
export type { CajaTiendaProps } from "./caja-tienda";
export type { StockBackItem, StockBackProps } from "./stock-back";

/** Plantillas disponibles: el id es el `template` de `createNotifications`. */
const templates = {
  "order-placed": orderPlaced,
  "order-shipped": orderShipped,
  "password-reset": passwordReset,
  "verify-email": verifyEmail,
  welcome,
  "account-deletion-request": accountDeletionRequest,
  "order-transfer": orderTransfer,
  "order-received-shop": orderReceivedShop,
  "transfer-reminder": transferReminder,
  "caja-propuesta": cajaPropuesta,
  "caja-tienda": cajaTienda,
  "stock-back": stockBack,
} as const;

export type TemplateId = keyof typeof templates;

export type TemplateProps = {
  "order-placed": orderPlaced.OrderPlacedProps;
  "order-shipped": orderShipped.OrderShippedProps;
  "password-reset": passwordReset.PasswordResetProps;
  "verify-email": verifyEmail.VerifyEmailProps;
  welcome: welcome.WelcomeProps;
  "account-deletion-request": accountDeletionRequest.AccountDeletionRequestProps;
  "order-transfer": orderTransfer.OrderTransferProps;
  "order-received-shop": orderReceivedShop.OrderReceivedShopProps;
  "transfer-reminder": transferReminder.TransferReminderProps;
  "caja-propuesta": cajaPropuesta.CajaPropuestaProps;
  "caja-tienda": cajaTienda.CajaTiendaProps;
  "stock-back": stockBack.StockBackProps;
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
