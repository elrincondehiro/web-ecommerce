import { toNumber, type Numeric } from "./numeric";

/**
 * Baja de la cuenta (fase 13, docs/fases/fase13-cuenta.md). Funciones PURAS; el workflow está en
 * `workflows/delete-account`.
 *
 * - Se bloquea mientras haya pedidos en curso (decisión del usuario): sin cancelar y con algo
 *   sin enviar, o con una devolución abierta. Enviado = hecho (la tienda no siempre marca
 *   «entregado»).
 * - El cliente confirma escribiendo la frase (no la rellena un gestor de contraseñas ni un clic sin
 *   querer) y su contraseña. Igual en `apps/storefront/src/lib/account.ts`.
 */

export const DELETE_PHRASE = "eliminar mi cuenta";

/** ¿Ha escrito la frase? Sin distinguir mayúsculas ni espacios de más. */
export function isDeletePhrase(value: string | null | undefined): boolean {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase() === DELETE_PHRASE;
}

/** Email que queda en la ficha borrada (dominio reservado `.invalid`, RFC 2606). */
export const anonymizedEmail = (customerId: string) => `borrado-${customerId}@invalid`;

export type OrderForDeletion = {
  status?: string | null;
  canceled_at?: unknown;
  items?: ({ quantity?: Numeric; detail?: { shipped_quantity?: Numeric } | null } | null)[] | null;
  returns?: ({ status?: string | null } | null)[] | null;
};

/** Estados de devolución abierta (ReturnStatus de Medusa 2.22). */
const OPEN_RETURN = new Set(["open", "requested", "partially_received"]);
/** Estados de pedido que ya no cuentan (ni borradores). */
const CLOSED = new Set(["canceled", "archived", "completed", "draft"]);

/** ¿Pedido en curso? Sin cancelar ni cerrar, y con algo sin enviar o una devolución abierta. */
export function isPendingOrder(order: OrderForDeletion): boolean {
  if (order.canceled_at || CLOSED.has(order.status ?? "")) return false;
  const unshipped = (order.items ?? []).some(
    (i) => i && toNumber(i.detail?.shipped_quantity) < toNumber(i.quantity),
  );
  const openReturn = (order.returns ?? []).some((r) => r && OPEN_RETURN.has(r.status ?? ""));
  return unshipped || openReturn;
}

export const PENDING_ORDERS_MESSAGE =
  "No se puede eliminar la cuenta mientras haya pedidos en curso (sin enviar o con una devolución abierta).";

/** Motivo opcional: texto plano, sin caracteres de control (salvo \n), máx. 500. */
export function cleanReason(value: string | null | undefined): string | null {
  // eslint-disable-next-line no-control-regex -- quitar caracteres de control
  const s = (value ?? "").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").trim();
  return s ? s.slice(0, 500) : null;
}
