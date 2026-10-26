/**
 * Parámetros de la sesión de pago de Stripe (Fase PG, docs/fases/fasePG-pagos.md). Función PURA:
 * la aplica el middleware de `POST /store/payment-collections/:id/payment-sessions`
 * (src/api/middlewares.ts) y la prueban los tests.
 *
 * - **Métodos fijos** en el servidor (decisión PG-a): tarjeta (con Apple Pay y Google Pay, que
 *   son tarjeta para Stripe), PayPal y Bizum. Sin Link (decisión del usuario: añadía al formulario
 *   de tarjeta el alta en Link con email, móvil y nombre). Aunque se active otro en el panel de Stripe,
 *   la tienda no lo ofrece. Con `payment_method_types`, el proveedor de Medusa no envía
 *   `automatic_payment_methods` (Stripe no admite los dos: probado en PG-0).
 * - **Captura mixta** (docs.stripe.com/payments/place-a-hold-on-a-payment-method, «capture
 *   after per payment method»): cobro inmediato por defecto (Bizum no admite «solo autorizar») y
 *   `manual` en tarjeta y PayPal, que se capturan desde el Admin como hasta ahora (fase 5).
 *   Un pago ya cobrado (Bizum) lo registra Medusa como autorizado y capturado a la vez
 *   (@medusajs/payment 2.21.2, `authorizePaymentSession_`).
 * - Lo que mande el navegador en `data` se **descarta**: ni los métodos ni el modo de captura
 *   los decide el cliente.
 */
export const STRIPE_PROVIDER_ID = "pp_stripe_stripe";

export const STRIPE_METHODS = ["card", "paypal", "bizum"] as const;
/** Métodos que se autorizan y se capturan después desde el Admin. */
export const MANUAL_CAPTURE_METHODS = ["card", "paypal"] as const;

export type StripeSessionData = {
  payment_method_types: string[];
  capture_method: "automatic";
  payment_method_options: Record<string, { capture_method: "manual" }>;
};

export function stripeSessionData(): StripeSessionData {
  return {
    payment_method_types: [...STRIPE_METHODS],
    capture_method: "automatic",
    payment_method_options: Object.fromEntries(
      MANUAL_CAPTURE_METHODS.map((m) => [m, { capture_method: "manual" as const }]),
    ),
  };
}

/** Cuerpo de la petición con los parámetros de Stripe impuestos (solo para Stripe). */
export function withStripeSessionData<T extends { provider_id?: unknown; data?: unknown }>(
  body: T,
): T {
  if (body?.provider_id !== STRIPE_PROVIDER_ID) return body;
  return { ...body, data: stripeSessionData() };
}
