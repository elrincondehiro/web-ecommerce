// Avisos de stock (Fase MK-B, docs/fases/faseMK-marketing.md §2): funciones PURAS para Vitest.
// La I/O está en lib/medusa.ts (rutas `/store/customers/me/stock-alerts*`) y la orquestación en
// src/actions/stock-alerts.ts. Solo con cuenta; por variante; un email y se borra.
// Sin sesión, como el ♡ (Fase L-1): cookie httpOnly de 10 minutos con el producto y la variante,
// y al entrar se crea el aviso.
import { safeBackPath } from "./cart";
import { isProductId, isVariantId } from "./wishlist";

export const STOCK_ALERTS_PATH = "/cuenta/avisos/";

export type StockAlertActionName = "stockAlert.add" | "stockAlert.remove";

/** Formularios sin JS: a la propia página de avisos (on-demand y privada), como la lista. */
export function stockAlertActionUrl(name: StockAlertActionName): string {
  return `${STOCK_ALERTS_PATH}?_action=${name}`;
}

export const ALERT_PENDING_COOKIE = "stock_alert_pending";
const TEN_MINUTES = 60 * 10;
export function alertPendingCookieOptions(secure: boolean) {
  return { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: TEN_MINUTES };
}

export interface AlertTarget {
  product_id: string;
  variant_id: string;
}

export function encodeAlertPending(t: AlertTarget): string {
  return `${t.product_id}:${t.variant_id}`;
}

export function decodeAlertPending(raw: string | undefined | null): AlertTarget | null {
  if (!raw || raw.length > 100) return null;
  const parts = raw.split(":");
  if (parts.length !== 2) return null;
  const [product_id, variant_id] = parts as [string, string];
  return isProductId(product_id) && isVariantId(variant_id) ? { product_id, variant_id } : null;
}

/** Avisos (toast con JS; `#aviso-<código>` con :target sin JS). */
export const ALERT_NOTICES = {
  alert_added: "Te avisaremos por email cuando vuelva.",
  alert_already: "Ya te íbamos a avisar de este producto.",
  alert_removed: "Aviso quitado.",
  alert_in_stock: "Ya hay stock: puedes comprarlo ahora.",
  alert_limit: "Has llegado al máximo de avisos a la vez. Quita alguno en tu cuenta.",
  alert_login: "Entra en tu cuenta para que te avisemos cuando vuelva.",
  alert_error: "No se ha podido guardar el aviso. Inténtalo de nuevo.",
} as const;
export type AlertNoticeCode = keyof typeof ALERT_NOTICES;
export const ALERT_NOTICE_CODES = Object.keys(ALERT_NOTICES) as AlertNoticeCode[];

export function isAlertError(code: AlertNoticeCode): boolean {
  return code === "alert_limit" || code === "alert_error";
}

export interface AlertResult {
  code: AlertNoticeCode;
  /** Sin sesión: URL de «Entrar» con `next` a la página de origen. */
  login?: string;
}

export function alertRedirectTarget(back: unknown, code: AlertNoticeCode): string {
  return `${safeBackPath(back)}#aviso-${code}`;
}

/** Error de la ruta propia → aviso (400 del workflow: hay stock, máximo). */
export function classifyAlertError(err: unknown): AlertNoticeCode {
  const message = err instanceof Error ? err.message : "";
  if (/Ya hay stock/i.test(message)) return "alert_in_stock";
  if (/Como mucho/i.test(message)) return "alert_limit";
  return "alert_error";
}
