/**
 * Método de pago de un pedido para los avisos y el Admin (Fase PG). Función PURA sobre el
 * `payment` de Medusa: `provider_id` y `data`, que para Stripe es el PaymentIntent con
 * `payment_method` expandido (lo pide el proveedor de Medusa 2.21.2 con `expand`), o solo su id.
 * Nunca devuelve datos de la tarjeta: solo el tipo («Tarjeta», «Apple Pay»…).
 */
export type PaymentLike = {
  provider_id?: string | null;
  captured_at?: string | Date | null;
  data?: Record<string, unknown> | null;
} | null;

export type PaymentMethodInfo = {
  /** «Tarjeta», «Apple Pay», «Google Pay», «Link», «PayPal», «Bizum», «Transferencia». */
  label: string;
  /** Ya cobrado (Bizum, o capturado desde el Admin). */
  captured: boolean;
  /** Transferencia manual pendiente de recibir. */
  transfer: boolean;
};

const WALLETS: Record<string, string> = { apple_pay: "Apple Pay", google_pay: "Google Pay" };
const TYPES: Record<string, string> = {
  card: "Tarjeta",
  link: "Link",
  paypal: "PayPal",
  bizum: "Bizum",
};

export const MANUAL_PROVIDER_ID = "pp_system_default";

export function paymentMethodInfo(payment: PaymentLike): PaymentMethodInfo | null {
  if (!payment?.provider_id) return null;
  const captured = Boolean(payment.captured_at);
  if (payment.provider_id === MANUAL_PROVIDER_ID) {
    return { label: "Transferencia", captured, transfer: true };
  }
  const pm = payment.data?.payment_method;
  const obj = pm && typeof pm === "object" ? (pm as Record<string, unknown>) : null;
  const type =
    (obj?.type as string | undefined) ??
    ((payment.data?.payment_method_types as string[] | undefined)?.length === 1
      ? (payment.data?.payment_method_types as string[])[0]
      : undefined);
  const wallet = (obj?.card as { wallet?: { type?: string } | null } | undefined)?.wallet?.type;
  const label = (wallet && WALLETS[wallet]) ?? (type && TYPES[type]) ?? (type ? type : "Stripe");
  return { label, captured, transfer: false };
}

/** «Bizum · cobrado», «Tarjeta · pendiente de capturar», «Transferencia · pendiente de recibir». */
export function paymentStatusLabel(info: PaymentMethodInfo | null): string | null {
  if (!info) return null;
  if (info.captured) return `${info.label} · cobrado`;
  return info.transfer
    ? `${info.label} · pendiente de recibir`
    : `${info.label} · pendiente de capturar`;
}
