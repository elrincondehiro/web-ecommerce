/**
 * Reglas de `orders:cancel` (script de desarrollo, src/scripts/orders-cancel.ts). Funciones puras.
 *
 * Solo se cancelan pedidos de PRUEBA: email exactamente `<algo>@example.com` (los e2e del
 * storefront compran con ese dominio, reservado para ejemplos: RFC 2606). Y solo los que
 * `cancelOrderWorkflow` acepta (core-flows 2.22.2, `cancelValidateOrder`): ni cancelados, ni
 * completados, ni con envíos (fulfillments) sin cancelar.
 */
export const TEST_EMAIL_DOMAIN = "example.com";

/** ¿Email de prueba? `x@example.com` sí; `x@sub.example.com`, `x@example.com.es` o vacío, no. */
export function isTestEmail(email: string | null | undefined): boolean {
  if (typeof email !== "string") return false;
  const at = email.trim().toLowerCase().lastIndexOf("@");
  if (at < 1) return false;
  return (
    email
      .trim()
      .toLowerCase()
      .slice(at + 1) === TEST_EMAIL_DOMAIN
  );
}

export interface CancelCandidate {
  status?: string | null;
  canceled_at?: string | Date | null;
  fulfillments?: ({ canceled_at?: string | Date | null } | null)[] | null;
}

export type SkipReason = "cancelado" | "completado" | "con envío";

/** Por qué no se puede cancelar (o null si se puede). */
export function skipReason(order: CancelCandidate): SkipReason | null {
  if (order.canceled_at || order.status === "canceled") return "cancelado";
  if (order.status === "completed") return "completado";
  if ((order.fulfillments ?? []).some((f) => f && !f.canceled_at)) return "con envío";
  return null;
}
