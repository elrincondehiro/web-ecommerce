// Carrito: funciones PURAS (sin astro:* ni I/O) para poder testearlas con Vitest.
// La I/O contra Medusa está en lib/medusa.ts y la orquestación en src/actions/index.ts.
// Patrón (fase 4): cookie httpOnly `cart_id` + Astro Actions con formularios (sin JS) y
// POST/Redirect/GET con aviso por fragmento (`#carrito-<código>`, visible con :target).

export const CART_COOKIE = "cart_id";
/** Ruta on-demand que recibe los POST de los formularios (las páginas estáticas no pueden). */
export const CART_PATH = "/carrito/";

export type CartActionName = "cart.add" | "cart.update" | "cart.remove";

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
  invalid: "Revisa la cantidad (entre 1 y 99).",
  error: "No se ha podido actualizar el carrito. Inténtalo de nuevo.",
} as const;

export type NoticeCode = keyof typeof NOTICES;
export const NOTICE_CODES = Object.keys(NOTICES) as NoticeCode[];

export function isErrorNotice(code: NoticeCode): boolean {
  return code === "stock" || code === "expired" || code === "invalid" || code === "error";
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
export type CartErrorKind = "stock" | "cart_invalid" | "error";

/**
 * Clasifica un error de @medusajs/js-sdk (FetchError: `status` + `message`; el SDK no expone
 * el `code`). Mensajes verificados contra Medusa 2.21.2:
 *   400 "Some variant does not have the required inventory"  → stock
 *   404 "Cart with id '…' not found"         (GET /store/carts/:id)        → cart_invalid
 *   404 "Cart id not found: …"                (POST …/line-items[/:id])     → cart_invalid
 *   400 "Cart … is already completed."                                      → cart_invalid
 *   DELETE …/line-items/:id con carrito inexistente → 500 unknown_error (se trata como "error";
 *   la action remove lo comprueba con un GET del carrito).
 */
export function classifyCartError(err: unknown): CartErrorKind {
  const status = (err as { status?: unknown } | null)?.status;
  const message = err instanceof Error ? err.message : "";
  if (/required inventory|insufficient_inventory/i.test(message)) return "stock";
  if (/already completed/i.test(message)) return "cart_invalid";
  if (status === 404 && /^cart (with id|id not found)/i.test(message)) return "cart_invalid";
  return "error";
}

/** Nº de artículos (suma de cantidades) de un carrito. */
export function itemCount(cart: { items?: { quantity?: number | null }[] | null } | null): number {
  return (cart?.items ?? []).reduce((n, i) => n + (i.quantity ?? 0), 0);
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
