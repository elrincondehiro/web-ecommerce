// Códigos descuento (Fase P): funciones PURAS (sin astro:* ni I/O) para Vitest. Las reglas (uno
// por pedido, solo con cuenta, tope de puntos tras el código) están en el backend
// (`apps/backend/src/lib/codes.ts`, ruta `/store/carts/:id/code`). Aquí, presentación.
import { POINTS_PROMO_PREFIX } from "./points";

/** Mismo formato que el backend (CODE_RE): el servidor vuelve a validar. */
const CODE_RE = /^[A-Z0-9][A-Z0-9_-]{1,39}$/;

export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return CODE_RE.test(code) && !code.startsWith(POINTS_PROMO_PREFIX) ? code : null;
}

type AdjustmentLike = { code?: string | null; amount?: number | null } | null;
type ItemWithAdjustments = { adjustments?: AdjustmentLike[] | null } | null;

/** Código descuento (no de puntos) de un carrito/pedido y su descuento: suma de sus ajustes. */
export function codeUsed(items: ItemWithAdjustments[] | null | undefined): {
  code: string | null;
  amount: number;
} {
  let code: string | null = null;
  let total = 0;
  for (const item of items ?? []) {
    for (const adj of item?.adjustments ?? []) {
      if (adj?.code && !adj.code.startsWith(POINTS_PROMO_PREFIX)) {
        code ??= adj.code;
        total += Number(adj.amount ?? 0);
      }
    }
  }
  return { code, amount: Math.round(total * 100) / 100 };
}

/**
 * Error del backend al aplicar un código → aviso del checkout. Mensajes de
 * `apps/backend/src/lib/codes.ts` (CODE_MESSAGES) y estados HTTP de la ruta.
 */
export function classifyCodeError(
  err: unknown,
): "code_invalid" | "code_not_applied" | "code_login" | "expired" | "error" {
  const status = (err as { status?: unknown } | null)?.status;
  const message = err instanceof Error ? err.message : String(err ?? "");
  if (status === 401 || /Entra en tu cuenta/i.test(message)) return "code_login";
  if (status === 404) return "expired";
  if (/no existe o no es válido/i.test(message)) return "code_invalid";
  if (/no se puede usar en este pedido/i.test(message)) return "code_not_applied";
  if (status === 400) return "code_invalid";
  return "error";
}
