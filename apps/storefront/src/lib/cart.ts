// Carrito: funciones PURAS (sin astro:* ni I/O) para poder testearlas con Vitest.
// La I/O contra Medusa está en lib/medusa.ts y la orquestación en src/actions/index.ts.
// Patrón (fase 4): cookie httpOnly `cart_id` + Astro Actions con formularios (sin JS) y
// POST/Redirect/GET con aviso por fragmento (`#carrito-<código>`, visible con :target).

import { BULK_MAX_G, formatGrams, lineRule, type LineLike } from "./bulk";

export const CART_COOKIE = "cart_id";
/** Ruta on-demand que recibe los POST de los formularios (las páginas estáticas no pueden). */
export const CART_PATH = "/carrito/";

export type CartActionName = "cart.add" | "cart.addCorrea" | "cart.update" | "cart.remove";

/** URL de un formulario sin JS: `?_action=<nombre>` (ACTION_QUERY_PARAMS de Astro). */
export function actionUrl(name: CartActionName): string {
  return `${CART_PATH}?_action=${name}`;
}
const THIRTY_DAYS = 60 * 60 * 24 * 30;

/** Opciones de la cookie del carrito. `secure` sale de COOKIE_SECURE (true salvo en http local). */
export function cartCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: THIRTY_DAYS,
  };
}

/** Ids de Medusa (`cart_…`, `variant_…`, `cali_…`): solo [A-Za-z0-9_], longitud acotada. */
export const ID_PATTERN = /^[A-Za-z0-9_]{1,64}$/;
export const MAX_QUANTITY = 99;

export function isValidId(value: string | undefined | null): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

/** Resultado de una operación del carrito. Se usa en la respuesta JSON y en el aviso sin JS. */
export const NOTICES = {
  added: "Añadido al carrito",
  updated: "Carrito actualizado",
  removed: "Producto eliminado del carrito",
  stock: "No hay stock suficiente",
  expired: "Tu carrito ha caducado. Vuelve a añadir los productos.",
  invalid: "Revisa la cantidad (entre 1 y 99; a granel, de paso en paso).",
  minimum: "No llega al mínimo de este producto a granel.",
  discontinued: "Este producto está descatalogado y ya no se puede comprar.",
  maximum: `El máximo de un producto a granel es ${formatGrams(BULK_MAX_G)} por pedido.`,
  correa:
    "Revisa la correa: la medida exacta tiene que caber en el largo elegido y las observaciones, tener 200 caracteres como mucho.",
  // Selector de opciones (Fase O): combinación que no existe (p. ej. HTML de un build anterior)
  variant: "Esa combinación de opciones no está disponible. Elige otra.",
  error: "No se ha podido actualizar el carrito. Inténtalo de nuevo.",
} as const;

export type NoticeCode = keyof typeof NOTICES;
export const NOTICE_CODES = Object.keys(NOTICES) as NoticeCode[];

export function isErrorNotice(code: NoticeCode): boolean {
  return code !== "added" && code !== "updated" && code !== "removed";
}

/** Mensaje para el toast (con JS); para "added" incluye el producto si se conoce. */
export function noticeMessage(code: NoticeCode, title?: string | null): string {
  if (code === "added" && title) return `Añadido: ${title}`;
  return NOTICES[code];
}

export interface CartResult {
  code: NoticeCode;
  /** Nº total de artículos tras la operación (null si no se sabe). */
  count: number | null;
  title?: string | null;
}

/** Tipos de error de la Store API relevantes para el carrito (ver fase4.md §3). */
export type CartErrorKind =
  "stock" | "minimum" | "discontinued" | "correa" | "cart_invalid" | "error";

/**
 * Clasifica un error de @medusajs/js-sdk (FetchError: `status` + `message`; el SDK no expone
 * el `code`). Mensajes verificados contra Medusa 2.21.2:
 *   400 "Some variant does not have the required inventory"  → stock
 *   400 "No queda material suficiente …" (hook validar-carrito: piezas compartidas entre
 *       líneas, Fase E-2)                                                     → stock
 *   404 "Cart with id '…' not found"         (GET /store/carts/:id)        → cart_invalid
 *   404 "Cart id not found: …"                (POST …/line-items[/:id])     → cart_invalid
 *   400 "Cart … is already completed."                                      → cart_invalid
 *   400 "El mínimo de este producto a granel es …" (hook validar-carrito)   → minimum
 *   400 "Este producto está descatalogado …"         (hook validar-carrito)   → discontinued
 *   400 "… medida exacta …" / "Las observaciones …" (hook validar-carrito, correa a medida,
 *       E-2: lib/correas.ts lineMetadataError)                                → correa
 *   DELETE …/line-items/:id con carrito inexistente → 500 unknown_error (se trata como "error";
 *   la action remove lo comprueba con un GET del carrito).
 */
export function classifyCartError(err: unknown): CartErrorKind {
  const status = (err as { status?: unknown } | null)?.status;
  const message = err instanceof Error ? err.message : "";
  if (/required inventory|insufficient_inventory|no queda material/i.test(message)) return "stock";
  if (/already completed/i.test(message)) return "cart_invalid";
  if (/mínimo de este producto a granel/i.test(message)) return "minimum";
  if (/descatalogado/i.test(message)) return "discontinued";
  if (/medida exacta|observaciones/i.test(message)) return "correa";
  if (status === 404 && /^cart (with id|id not found)/i.test(message)) return "cart_invalid";
  return "error";
}

/**
 * Nº de artículos de un carrito o pedido: suma de cantidades, salvo las líneas a granel (S-3),
 * que cuentan 1 (su cantidad son pasos de 5 g, no artículos).
 */
export function itemCount(cart: { items?: LineLike[] | null } | null | undefined): number {
  return (cart?.items ?? []).reduce((n, i) => n + (lineRule(i) ? 1 : (i.quantity ?? 0)), 0);
}

const ORIGIN = "http://local.invalid";

/**
 * Ruta de vuelta tras el POST (campo oculto `back`). Solo rutas relativas del MISMO sitio
 * (evita open redirect): debe empezar por "/" y no por "//" ni "/\". Se descarta el hash.
 */
export function safeBackPath(back: unknown, fallback = "/"): string {
  if (typeof back !== "string" || back.length === 0 || back.length > 512) return fallback;
  if (!back.startsWith("/") || back.startsWith("//") || back.startsWith("/\\")) return fallback;
  // eslint-disable-next-line no-control-regex -- se rechazan caracteres de control a propósito
  if (/[\u0000-\u001f\u007f]/.test(back)) return fallback;
  try {
    const url = new URL(back, ORIGIN);
    if (url.origin !== ORIGIN) return fallback;
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}

/** Destino del 303 sin JS: la página de origen con el aviso como fragmento. */
export function redirectTarget(back: unknown, code: NoticeCode): string {
  return `${safeBackPath(back)}#carrito-${code}`;
}
