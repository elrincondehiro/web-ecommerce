/**
 * Programa de puntos (Fase L-2): reglas PURAS (sin BD) para poder probarlas.
 * Decisiones (docs/fases/faseL-deseos-puntos.md §0.1 y plan L-2):
 *   - 0,8 % de los productos pagados, CON IVA, SIN envío, después de descuentos (`item_total`):
 *     la parte pagada con puntos (es un descuento) no genera puntos (K2).
 *   - 1 punto = 1 €, con decimales; redondeo al céntimo HACIA ABAJO (P4).
 *   - Productos con `metadata.sin_puntos = true` no generan puntos (K3, hoja del catálogo).
 *   - Se consolidan a los `POINTS_CONSOLIDATE_DAYS` días (14) del ÚLTIMO envío (P1), sin
 *     cancelar. No caducan (U5). Solo web (M2: la tienda física va aparte, `channel`).
 *   - Canje: promoción de un uso; siempre quedan ≥ 0,50 € por pagar (mínimo de Stripe en EUR,
 *     docs.stripe.com/currencies) contando el envío (U2).
 */
import { toNumber } from "./numeric";

export const POINTS_RATE = 0.008;
export const POINTS_CONSOLIDATE_DEFAULT_DAYS = 14;
export const POINTS_ACCRUE_DEFAULT_CRON = "0 4 * * *";
/** Mínimo que cobra Stripe en EUR: el canje nunca deja menos por pagar. */
export const MIN_CHARGE_EUR = 0.5;
/** Prefijo del código de las promociones de canje. */
export const POINTS_PROMO_PREFIX = "PTS-";
export const NO_POINTS_KEY = "sin_puntos";
export const POINTS_CHANNEL_WEB = "web";

/** Referencias de los movimientos (`points_transaction.reference`). */
export const REF = {
  order: "order", // credit: abono del pedido consolidado
  redeem: "order_redeem", // debit: canje al hacer el pedido
  canceled: "order_canceled", // credit: devolución de lo canjeado si se cancela
  return: "return", // debit: parte devuelta tras el abono
  adjustment: "adjustment", // credit/debit manual (admin), con nota
  deleted: "account_deleted", // debit: baja de la cuenta (G6, se pierde el saldo)
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Redondeo al céntimo hacia abajo, tolerante a errores de coma flotante (30 × 0,008 = 0,24). */
export function floorCents(n: number): number {
  if (!(n > 0)) return 0;
  return Math.floor(Math.round(n * 1e6) / 1e4) / 100;
}

/** Redondeo normal al céntimo (importes de Medusa). */
export function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Días de `POINTS_CONSOLIDATE_DAYS`: entero ≥ 0, o 14. */
export function consolidateDays(raw: string | undefined): number {
  const n = Number(raw);
  return raw !== undefined && raw !== "" && Number.isInteger(n) && n >= 0
    ? n
    : POINTS_CONSOLIDATE_DEFAULT_DAYS;
}

type Numeric = Parameters<typeof toNumber>[0];
export type AccrualItem = {
  total?: Numeric;
  product?: { metadata?: Record<string, unknown> | null } | null;
  variant?: { product?: { metadata?: Record<string, unknown> | null } | null } | null;
};

const excluded = (i: AccrualItem): boolean => {
  const meta = i.product?.metadata ?? i.variant?.product?.metadata;
  return meta?.[NO_POINTS_KEY] === true;
};

/** Base de cálculo: suma de `total` de las líneas (con IVA, tras descuentos), sin `sin_puntos`. */
export function accrualBase(
  items: (AccrualItem | null)[] | null | undefined,
  returned = 0,
): number {
  const base = (items ?? []).reduce(
    (acc, i) => (i && !excluded(i) ? acc + toNumber(i.total) : acc),
    0,
  );
  return Math.max(0, roundCents(base - returned));
}

/** Puntos de un importe: 0,8 % al céntimo hacia abajo. */
export function pointsFor(amount: number): number {
  return floorCents(amount * POINTS_RATE);
}

export type FulfillmentLike = {
  shipped_at?: string | Date | null;
  canceled_at?: string | Date | null;
} | null;

/**
 * ¿El pedido ya se puede abonar? Sin cancelar, con algún envío no cancelado y el ÚLTIMO envío
 * hace ≥ `days` días (P1: 14 días desde el envío, aunque se haya entregado antes).
 */
export function isConsolidated(
  order: { status?: string | null; canceled_at?: unknown; fulfillments?: FulfillmentLike[] | null },
  now: Date,
  days: number,
): boolean {
  if (order.status === "canceled" || order.canceled_at) return false;
  const shipped = (order.fulfillments ?? [])
    .filter((f) => f && !f.canceled_at && f.shipped_at)
    .map((f) => new Date(f!.shipped_at!).getTime());
  if (!shipped.length) return false;
  return Math.max(...shipped) <= now.getTime() - days * DAY_MS;
}

/**
 * Máximo canjeable en un carrito: lo que quede por pagar debe ser ≥ 0,50 €, y el descuento solo
 * se aplica a los productos (la promoción `order` no toca el envío; spike L-0).
 *   max = min(saldo, productos − máx(0, 0,50 − envío))
 * `itemTotal` es el de los productos SIN el descuento de puntos (original_item_total menos
 * otros descuentos; con un solo descuento posible hoy, `original_item_total`).
 */
export function maxRedeemable(balance: number, itemTotal: number, shippingTotal: number): number {
  const room = itemTotal - Math.max(0, MIN_CHARGE_EUR - Math.max(0, shippingTotal));
  return Math.max(0, floorCents(Math.min(balance, room)));
}

export type TransactionLike = { type: "credit" | "debit"; amount: Numeric };

/** Saldo = Σ abonos − Σ cargos (no se guarda: se calcula de los movimientos, auditable). */
export function balanceOf(transactions: (TransactionLike | null)[] | null | undefined): number {
  const total = (transactions ?? []).reduce(
    (acc, t) => (t ? acc + (t.type === "credit" ? 1 : -1) * toNumber(t.amount) : acc),
    0,
  );
  return roundCents(total);
}

export function isPointsPromoCode(code: string | null | undefined): boolean {
  return typeof code === "string" && code.startsWith(POINTS_PROMO_PREFIX);
}

/** Descuento real de puntos de un carrito o pedido: suma de los ajustes con código de puntos. */
export function pointsDiscount(
  items:
    | ({ adjustments?: ({ code?: string | null; amount?: Numeric } | null)[] | null } | null)[]
    | null
    | undefined,
): { code: string | null; amount: number } {
  let code: string | null = null;
  let amount = 0;
  for (const item of items ?? []) {
    for (const adj of item?.adjustments ?? []) {
      if (adj && isPointsPromoCode(adj.code)) {
        code = adj.code!;
        amount += toNumber(adj.amount);
      }
    }
  }
  return { code, amount: roundCents(amount) };
}
