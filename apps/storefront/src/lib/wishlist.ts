// Lista de deseos (Fase L-1): funciones PURAS (sin astro:* ni I/O) para Vitest. La I/O contra
// Medusa está en lib/medusa.ts (rutas propias `/store/customers/me/wishlist*`) y la
// orquestación en src/actions/wishlist.ts. Diseño: docs/fases/faseL-deseos-puntos.md §2.
// Solo con cuenta (W1). Se guarda el producto y, opcionalmente, la variante (W2). Botón
// «Guardar» sin estado ♥ en las páginas estáticas (W7): `add` es idempotente.
import { ID_PATTERN, safeBackPath } from "./cart";

export const WISHLIST_PATH = "/cuenta/deseos/";

/** Id del formulario de compra de la ficha (BuyBox / CorreaBuilder): el ♡ del título lo envía. */
export const BUY_FORM_ID = "comprar";

export type WishlistActionName =
  "wishlist.add" | "wishlist.remove" | "wishlist.share" | "wishlist.unshare";

/** Lista compartida (L-1b): página pública /deseos/<token>/ (on-demand, privada, noindex). */
export const SHARED_WISHLIST_PREFIX = "/deseos/";
/** Token del enlace público: 32 bytes en base64url (backend: SHARE_TOKEN_RE). */
export const SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export function sharedWishlistPath(token: string): string {
  return `${SHARED_WISHLIST_PREFIX}${token}/`;
}

/**
 * URL de un formulario sin JS. Va a la propia lista (ruta on-demand y privada): las páginas
 * estáticas no reciben POST. El middleware responde 303 a `back` (o JSON con JS).
 */
export function wishlistActionUrl(name: WishlistActionName): string {
  return `${WISHLIST_PATH}?_action=${name}`;
}

/**
 * Producto pendiente de guardar mientras el cliente entra (decisión del usuario, L-1): cookie
 * httpOnly de 10 minutos con `product_id[:variant_id]`. Al entrar se guarda y se borra.
 */
export const WISH_PENDING_COOKIE = "wish_pending";
const TEN_MINUTES = 60 * 10;
export function wishPendingCookieOptions(secure: boolean) {
  return { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: TEN_MINUTES };
}

export interface WishTarget {
  product_id: string;
  variant_id: string | null;
}

const PRODUCT_RE = /^prod_[0-9A-Za-z]{1,40}$/;
const VARIANT_RE = /^variant_[0-9A-Za-z]{1,40}$/;

export function isProductId(value: unknown): value is string {
  return typeof value === "string" && PRODUCT_RE.test(value) && ID_PATTERN.test(value);
}
export function isVariantId(value: unknown): value is string {
  return typeof value === "string" && VARIANT_RE.test(value) && ID_PATTERN.test(value);
}

export function encodeWishPending(t: WishTarget): string {
  return t.variant_id ? `${t.product_id}:${t.variant_id}` : t.product_id;
}

/** Cookie pendiente → destino, o null si el valor no es válido (nunca lanza). */
export function decodeWishPending(raw: string | undefined | null): WishTarget | null {
  if (!raw || raw.length > 100) return null;
  const [product_id, variant_id, extra] = raw.split(":");
  if (extra !== undefined || !isProductId(product_id)) return null;
  if (variant_id === undefined) return { product_id, variant_id: null };
  return isVariantId(variant_id) ? { product_id, variant_id } : null;
}

/** Avisos de la lista (toast con JS; `#deseos-<código>` con :target sin JS). */
export const WISH_NOTICES = {
  wish_added: "Guardado en tu lista de deseos",
  wish_already: "Ya estaba en tu lista de deseos",
  wish_removed: "Quitado de tu lista de deseos",
  wish_shared: "Enlace creado: ya puedes compartir tu lista.",
  wish_unshared: "Has dejado de compartir tu lista: el enlace ya no funciona.",
  wish_login: "Entra en tu cuenta para guardar productos en tu lista de deseos.",
  wish_discontinued: "Este producto está descatalogado.",
  wish_error: "No se ha podido actualizar tu lista. Inténtalo de nuevo.",
} as const;
export type WishNoticeCode = keyof typeof WISH_NOTICES;
export const WISH_NOTICE_CODES = Object.keys(WISH_NOTICES) as WishNoticeCode[];

export function isWishError(code: WishNoticeCode): boolean {
  return code === "wish_discontinued" || code === "wish_error";
}

/** Resultado de una action de la lista: aviso y, si hay que entrar, a dónde. */
export interface WishResult {
  code: WishNoticeCode;
  /** Sin sesión: URL de «Entrar» con `next` a la página de origen. */
  login?: string;
}

/** Destino del 303 sin JS: la página de origen con el aviso como fragmento. */
export function wishRedirectTarget(back: unknown, code: WishNoticeCode): string {
  return `${safeBackPath(back)}#deseos-${code}`;
}

/** Error de la ruta propia → código de aviso (400 «descatalogado» del workflow). */
export function classifyWishError(err: unknown): WishNoticeCode {
  const message = err instanceof Error ? err.message : "";
  return /descatalogado/i.test(message) ? "wish_discontinued" : "wish_error";
}

// ── Página /cuenta/deseos/ ───────────────────────────────────────────────────────────────

/** Lo mínimo de un producto (Store API con precio y stock) para pintar una fila de la lista. */
export interface WishProductLike {
  id: string;
  handle?: string | null;
  title?: string | null;
  thumbnail?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface WishRow<P extends WishProductLike> {
  /** Id de la entrada (vacío en la lista compartida: no se puede quitar). */
  itemId: string;
  product: P;
  /** Variante guardada (si se guardó una y sigue existiendo); si no, null. */
  variantId: string | null;
}

/**
 * Une las entradas de la lista (orden: más reciente primero) con los productos de la Store API.
 * Las entradas cuyo producto ya no se publica (o se borró) se omiten; una variante guardada que
 * ya no existe se trata como el producto.
 */
export function wishRows<P extends WishProductLike & { variants?: { id: string }[] | null }>(
  items: { id: string; product_id: string; variant_id: string | null }[],
  products: P[],
): WishRow<P>[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  return items.flatMap((item) => {
    const product = byId.get(item.product_id);
    if (!product) return [];
    const variantId =
      item.variant_id && (product.variants ?? []).some((v) => v.id === item.variant_id)
        ? item.variant_id
        : null;
    return [{ itemId: item.id, product, variantId }];
  });
}
