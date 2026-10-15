// Programa de puntos (Fase L-3): funciones PURAS (sin astro:* ni I/O) para Vitest. Las REGLAS
// (0,8 %, topes, consolidación) están solo en el backend (`apps/backend/src/lib/points.ts`); aquí
// solo se presentan los datos que devuelve (`/store/customers/me/points`,
// `/store/carts/:id/points`). Diseño: docs/fases/faseL-deseos-puntos.md §3 y §6.5.

export const POINTS_PATH = "/cuenta/puntos/";
/** Condiciones del programa (página legal, L-4). */
export const POINTS_TERMS_PATH = "/condiciones-puntos/";
/** Mismo prefijo que la promoción de canje del backend (POINTS_PROMO_PREFIX). */
export const POINTS_PROMO_PREFIX = "PTS-";
/** Días desde el envío hasta que se suman (backend: POINTS_CONSOLIDATE_DAYS; texto informativo). */
export const POINTS_CONSOLIDATE_DAYS = 14;

export type PointsTransaction = {
  id: string;
  type: "credit" | "debit";
  amount: number;
  reference: string;
  order_id: string | null;
  order_display_id: number | null;
  note: string | null;
  created_at: string;
};

export type PointsSummary = {
  balance: number;
  pending: number;
  transactions: PointsTransaction[];
  count: number;
};

/** `GET /store/carts/:id/points`: balance/max = null si no hay sesión o el carrito no es suyo. */
export type CartPoints = {
  earn: number;
  applied: number;
  balance: number | null;
  max: number | null;
};

const REFERENCE_LABELS: Record<string, string> = {
  order: "Puntos del pedido",
  order_redeem: "Usados en el pedido",
  order_canceled: "Devueltos por cancelar el pedido",
  return: "Retirados por una devolución",
  adjustment: "Ajuste",
  account_deleted: "Baja de la cuenta",
};

/** Concepto de un movimiento para «Mi cuenta» («Puntos del pedido #123»). */
export function transactionLabel(
  t: Pick<PointsTransaction, "reference" | "order_display_id">,
): string {
  const base = REFERENCE_LABELS[t.reference] ?? "Movimiento";
  return t.order_display_id && t.reference.startsWith("order")
    ? `${base} #${t.order_display_id}`
    : base;
}

type AdjustmentLike = { code?: string | null; amount?: number | null } | null;
type ItemWithAdjustments = { adjustments?: AdjustmentLike[] | null } | null;

/** Descuento de puntos de un carrito/pedido: suma de los ajustes con código PTS-. */
export function pointsUsed(items: ItemWithAdjustments[] | null | undefined): number {
  let total = 0;
  for (const item of items ?? []) {
    for (const adj of item?.adjustments ?? []) {
      if (adj?.code?.startsWith(POINTS_PROMO_PREFIX)) total += Number(adj.amount ?? 0);
    }
  }
  return Math.round(total * 100) / 100;
}

/**
 * Importe del formulario «Usar otro importe» (coma o punto, hasta 2 decimales) → número, o null
 * si no es válido. El tope lo comprueba el backend.
 */
export function parsePointsAmount(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().replace(",", ".");
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(value)) return null;
  const n = Number(value);
  return n > 0 ? n : null;
}

/** «12,34» para el campo del importe (sin símbolo; `inputmode="decimal"`). */
export function amountInputValue(n: number): string {
  return n.toFixed(2).replace(".", ",");
}
