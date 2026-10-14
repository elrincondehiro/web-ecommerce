// Actions de la lista de deseos (Fase L-1). Como las del carrito (fase 4): `accept: "form"`,
// funcionan con un <form method="POST"> sin JS. El middleware responde 303 a `back` con el aviso
// `#deseos-<código>` (sin JS) o JSON `{ code, msg, login? }` (fetch de CartClient con JS).
// Sin sesión (W1: solo con cuenta): se guarda el producto en la cookie `wish_pending` (10 min) y
// se manda a «Entrar» con `next` a la página de origen; al entrar, account.login lo guarda.
// Fuente: astro-docs (guides/actions); diseño en docs/fases/faseL-deseos-puntos.md §2.
import type { ActionAPIContext } from "astro:actions";
import { defineAction } from "astro:actions";
import { COOKIE_SECURE } from "astro:env/server";
import { z } from "astro/zod";
import { loginRedirect } from "$lib/account";
import { ID_PATTERN, safeBackPath } from "$lib/cart";
import { addToWishlist, removeFromWishlist, shareWishlist, unshareWishlist } from "$lib/medusa";
import {
  WISHLIST_PATH,
  WISH_PENDING_COOKIE,
  classifyWishError,
  encodeWishPending,
  isProductId,
  isVariantId,
  wishPendingCookieOptions,
  type WishResult,
} from "$lib/wishlist";

function logError(ctx: ActionAPIContext, op: string, err: unknown): void {
  // Sin datos personales: solo la operación y el mensaje de la Store API.
  ctx.logger.error(`deseos ${op}: ${err instanceof Error ? err.message : String(err)}`);
}

const isUnauthorized = (err: unknown) => (err as { status?: unknown } | null)?.status === 401;

/** Sin sesión: deja el producto pendiente y manda a «Entrar» (vuelve a `back`). */
function toLogin(ctx: ActionAPIContext, back: string, pending?: string): WishResult {
  if (pending)
    ctx.cookies.set(WISH_PENDING_COOKIE, pending, wishPendingCookieOptions(COOKIE_SECURE));
  return { code: "wish_login", login: loginRedirect(back) };
}

export const wishlist = {
  add: defineAction({
    accept: "form",
    input: z.object({
      product_id: z.string().refine(isProductId),
      variant_id: z.string().refine(isVariantId).nullish(),
      // Botón de la ficha (dentro del formulario de Añadir): «variant» guarda la variante
      // elegida; «product» (o el formulario propio, sin `wish`) solo el producto.
      wish: z.enum(["product", "variant"]).nullish(),
      back: z.string().max(512).nullish(),
    }),
    handler: async ({ product_id, variant_id, wish, back }, ctx): Promise<WishResult> => {
      const target = { product_id, variant_id: wish === "variant" ? (variant_id ?? null) : null };
      const origin = safeBackPath(back);
      const token = ctx.locals.customerToken;
      if (!token) return toLogin(ctx, origin, encodeWishPending(target));
      try {
        const { created } = await addToWishlist(token, target.product_id, target.variant_id);
        return { code: created ? "wish_added" : "wish_already" };
      } catch (err) {
        if (isUnauthorized(err)) return toLogin(ctx, origin, encodeWishPending(target));
        const code = classifyWishError(err);
        if (code === "wish_error") logError(ctx, "add", err);
        return { code };
      }
    },
  }),

  remove: defineAction({
    accept: "form",
    input: z.object({
      item_id: z.string().regex(ID_PATTERN),
      back: z.string().max(512).nullish(),
    }),
    handler: async ({ item_id, back }, ctx): Promise<WishResult> => {
      const token = ctx.locals.customerToken;
      if (!token) return toLogin(ctx, safeBackPath(back));
      try {
        await removeFromWishlist(token, item_id);
        return { code: "wish_removed" };
      } catch (err) {
        if (isUnauthorized(err)) return toLogin(ctx, safeBackPath(back));
        logError(ctx, "remove", err);
        return { code: "wish_error" };
      }
    },
  }),

  /** Compartir por enlace (L-1b). Siempre vuelve a la lista (PRG), donde se ve el enlace. */
  share: defineAction({
    accept: "form",
    handler: async (_form, ctx): Promise<WishResult> => {
      const token = ctx.locals.customerToken;
      if (!token) return toLogin(ctx, WISHLIST_PATH);
      try {
        await shareWishlist(token);
        return { code: "wish_shared" };
      } catch (err) {
        if (isUnauthorized(err)) return toLogin(ctx, WISHLIST_PATH);
        logError(ctx, "share", err);
        return { code: "wish_error" };
      }
    },
  }),

  /** Dejar de compartir (L-1b): el enlace anterior da 404. */
  unshare: defineAction({
    accept: "form",
    handler: async (_form, ctx): Promise<WishResult> => {
      const token = ctx.locals.customerToken;
      if (!token) return toLogin(ctx, WISHLIST_PATH);
      try {
        await unshareWishlist(token);
        return { code: "wish_unshared" };
      } catch (err) {
        if (isUnauthorized(err)) return toLogin(ctx, WISHLIST_PATH);
        logError(ctx, "unshare", err);
        return { code: "wish_error" };
      }
    },
  }),
};
