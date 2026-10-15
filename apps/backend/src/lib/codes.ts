/**
 * Códigos descuento (Fase P): reglas PURAS (sin BD). Decisiones del usuario
 * (docs/fases/faseP-codigos.md §0.1):
 *   - Solo clientes con cuenta. UN código por pedido (uno nuevo sustituye al anterior).
 *   - Combinable con puntos: el mínimo de 0,50 € por pagar se cumple siempre (los puntos se
 *     calculan con el código ya descontado, lib/points.ts `maxRedeemable`).
 *   - Orden de Medusa 2.21.2 (spike P-0): aplica primero la promoción de MAYOR valor numérico
 *     (sin distinguir % y €). Con un código en % y muchos puntos, el % se calcula sobre lo que
 *     queda tras los puntos (avisado en las condiciones de compra).
 * Los códigos los crea la tienda en el Admin (Promociones); los de puntos (`PTS-`) no se aceptan.
 */
import { toNumber, type Numeric } from "./numeric";
import { isPointsPromoCode, roundCents } from "./points";

/** Formato admitido: letras, números, guion y guion bajo (como los crea el Admin). */
export const CODE_RE = /^[A-Z0-9][A-Z0-9_-]{1,39}$/;

/**
 * Normaliza lo que escribe el cliente: sin espacios y en mayúsculas. Medusa guarda el código tal
 * cual (índice único sensible a mayúsculas): la tienda debe crear los códigos en MAYÚSCULAS.
 */
export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return CODE_RE.test(code) && !isPointsPromoCode(code) ? code : null;
}

type Adj = { code?: string | null; amount?: Numeric } | null;
type ItemAdj = { adjustments?: Adj[] | null } | null;

/** Descuento de los códigos (no de puntos) aplicados: suma de sus ajustes y el código. */
export function codeDiscount(items: ItemAdj[] | null | undefined): {
  code: string | null;
  amount: number;
} {
  let code: string | null = null;
  let amount = 0;
  for (const item of items ?? []) {
    for (const adj of item?.adjustments ?? []) {
      if (adj?.code && !isPointsPromoCode(adj.code)) {
        code ??= adj.code;
        amount += toNumber(adj.amount);
      }
    }
  }
  return { code, amount: roundCents(amount) };
}

/** Códigos de cliente (no de puntos) de una lista de promociones del carrito. */
export function customerCodes(
  promotions: ({ code?: string | null } | null)[] | null | undefined,
): string[] {
  return (promotions ?? [])
    .map((p) => p?.code ?? null)
    .filter((c): c is string => !!c && !isPointsPromoCode(c));
}

/** Mensajes al cliente (español) de los errores de un código. */
export const CODE_MESSAGES = {
  invalid: "Ese código no existe o no es válido.",
  notApplied:
    "Ese código no se puede usar en este pedido: puede haber caducado, estar agotado, haberlo usado ya o no aplicarse a estos productos.",
  account: "Entra en tu cuenta para usar un código descuento.",
  one: "Solo se puede usar un código descuento por pedido.",
} as const;

/**
 * Productos que quedan para los puntos: `original_item_total − descuento del código`. El
 * descuento del código es el que hace SOLO, sin puntos (lo calcula Medusa con `computeActions`,
 * lib/points-cart.ts), que es su máximo: si Medusa aplica antes los puntos (lo ordena por valor,
 * spike P-0), el código descuenta menos y el total solo sube. Así
 * `maxRedeemable(saldo, esto, envío)` deja siempre ≥ 0,50 € por pagar.
 */
export function itemsAfterCode(originalItemTotal: number, codeAlone: number): number {
  return Math.max(0, roundCents(originalItemTotal - codeAlone));
}
