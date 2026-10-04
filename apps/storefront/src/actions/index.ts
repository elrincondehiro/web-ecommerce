// Astro Actions del carrito (fase 4). Aceptan FormData (`accept: "form"`), así funcionan con un
// <form method="POST"> sin JS. Los formularios apuntan a `/carrito/?_action=cart.<x>` (ruta
// on-demand: las páginas estáticas no reciben POST). El middleware ejecuta la action y responde
// con un 303 a la página de origen (sin JS) o con JSON simple (fetch con Accept: JSON).
// Fuente: astro-docs (guides/actions, reference/modules/astro-actions).
//
// Los fallos de negocio (sin stock, carrito caducado) NO lanzan error: devuelven un CartResult
// con su código, así el middleware decide el aviso sin depender del formato de ActionError.
import type { ActionAPIContext } from "astro:actions";
import { defineAction } from "astro:actions";
import { COOKIE_SECURE } from "astro:env/server";
import { z } from "astro/zod";
import {
  CART_COOKIE,
  ID_PATTERN,
  MAX_QUANTITY,
  cartCookieOptions,
  classifyCartError,
  isValidId,
  itemCount,
  type CartResult,
} from "$lib/cart";
import {
  addLineItem,
  createCart,
  deleteLineItem,
  retrieveCart,
  updateLineItem,
  type StoreCart,
} from "$lib/medusa";
import { checkout } from "./checkout";

const id = z.string().regex(ID_PATTERN);
const quantity = z.number().int().min(1).max(MAX_QUANTITY);

function getCartId(ctx: ActionAPIContext): string | null {
  const value = ctx.cookies.get(CART_COOKIE)?.value;
  return isValidId(value) ? value : null;
}

function setCartId(ctx: ActionAPIContext, cartId: string): void {
  ctx.cookies.set(CART_COOKIE, cartId, cartCookieOptions(COOKIE_SECURE));
}

function clearCartId(ctx: ActionAPIContext): void {
  ctx.cookies.delete(CART_COOKIE, { path: "/" });
}

function logError(ctx: ActionAPIContext, op: string, err: unknown): void {
  // Sin datos personales: solo la operación y el mensaje de la Store API.
  ctx.logger.error(`carrito ${op}: ${err instanceof Error ? err.message : String(err)}`);
}

function titleOf(cart: StoreCart, variantId: string): string | null {
  return cart.items?.find((i) => i.variant_id === variantId)?.product_title ?? null;
}

export const server = {
  checkout,
  cart: {
    add: defineAction({
      accept: "form",
      input: z.object({ variant_id: id, quantity: quantity.default(1) }),
      handler: async ({ variant_id, quantity }, ctx): Promise<CartResult> => {
        // Hasta 2 intentos: si la cookie apunta a un carrito inexistente o completado, se crea
        // otro y se reintenta una vez.
        let cartId = getCartId(ctx);
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            if (!cartId) {
              cartId = (await createCart()).id;
              setCartId(ctx, cartId);
            }
            const cart = await addLineItem(cartId, variant_id, quantity);
            return { code: "added", count: itemCount(cart), title: titleOf(cart, variant_id) };
          } catch (err) {
            const kind = classifyCartError(err);
            if (kind === "stock") return { code: "stock", count: null };
            if (kind === "cart_invalid" && attempt === 0) {
              clearCartId(ctx);
              cartId = null;
              continue;
            }
            logError(ctx, "add", err);
            return { code: "error", count: null };
          }
        }
        return { code: "error", count: null };
      },
    }),

    update: defineAction({
      accept: "form",
      // quantity 0 = quitar la línea
      input: z.object({ line_id: id, quantity: z.number().int().min(0).max(MAX_QUANTITY) }),
      handler: async ({ line_id, quantity }, ctx): Promise<CartResult> => {
        const cartId = getCartId(ctx);
        if (!cartId) return { code: "expired", count: 0 };
        try {
          if (quantity === 0) {
            const cart = await deleteLineItem(cartId, line_id);
            return { code: "removed", count: itemCount(cart) };
          }
          const cart = await updateLineItem(cartId, line_id, quantity);
          return { code: "updated", count: itemCount(cart) };
        } catch (err) {
          const kind = classifyCartError(err);
          if (kind === "stock") return { code: "stock", count: null };
          if (kind === "cart_invalid") {
            clearCartId(ctx);
            return { code: "expired", count: 0 };
          }
          logError(ctx, "update", err);
          return { code: "error", count: null };
        }
      },
    }),

    remove: defineAction({
      accept: "form",
      input: z.object({ line_id: id }),
      handler: async ({ line_id }, ctx): Promise<CartResult> => {
        const cartId = getCartId(ctx);
        if (!cartId) return { code: "expired", count: 0 };
        try {
          const cart = await deleteLineItem(cartId, line_id);
          return { code: "removed", count: itemCount(cart) };
        } catch (err) {
          // DELETE con carrito inexistente responde 500 genérico: se confirma con un GET.
          const kind = await retrieveCart(cartId).then(
            (c) => (c.completed_at ? "cart_invalid" : classifyCartError(err)),
            (e: unknown) => classifyCartError(e),
          );
          if (kind === "cart_invalid") {
            clearCartId(ctx);
            return { code: "expired", count: 0 };
          }
          logError(ctx, "remove", err);
          return { code: "error", count: null };
        }
      },
    }),
  },
};
