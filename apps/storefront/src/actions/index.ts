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
import { bulkRule, checkGrams, lineRule } from "$lib/bulk";
import { cleanNotes, findCorreaVariant } from "$lib/correa";
import { CORREA_LINE_META, NOTES_MAX, cajaFromForm, exactRange } from "$lib/line-data";
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
  getProductVariantsMeta,
  getVariantMetadata,
  retrieveCart,
  updateLineItem,
  type StoreCart,
} from "$lib/medusa";
import { account } from "./account";
import { pets } from "./pets";
import { resolveVariant } from "./resolve-variant";
import { checkout } from "./checkout";
import { wishlist } from "./wishlist";

const id = z.string().regex(ID_PATTERN);
const quantity = z.number().int().min(1).max(MAX_QUANTITY);
/**
 * Granel (S-3): gramos del campo o de un acceso rápido (`preset`). Vacío → null. El tope de zod
 * es solo de cordura: paso, mínimo y máximo (BULK_MAX_G → aviso «maximum») los mira checkGrams.
 */
const grams = z.number().int().min(0).max(1_000_000).nullish();
/** Selector de opciones (Fase O): «Título:valor» de cada opción. */
const optionField = z.string().min(3).max(200).nullish();

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

const fail = (kind: ReturnType<typeof classifyCartError>): CartResult | null =>
  kind === "stock" ||
  kind === "minimum" ||
  kind === "discontinued" ||
  kind === "correa" ||
  kind === "caja"
    ? { code: kind, count: null }
    : null;

/**
 * Añade una línea; si la cookie apunta a un carrito inexistente o completado, crea otro y
 * reintenta una vez.
 */
async function addWithRetry(
  ctx: ActionAPIContext,
  op: string,
  variantId: string,
  units: number,
  metadata?: Record<string, unknown>,
): Promise<CartResult> {
  let cartId = getCartId(ctx);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (!cartId) {
        // Con sesión, el carrito nace ya asociado al cliente (fase 9).
        cartId = (await createCart(undefined, ctx.locals.customerToken)).id;
        setCartId(ctx, cartId);
      }
      const cart = await addLineItem(cartId, variantId, units, metadata);
      return { code: "added", count: itemCount(cart), title: titleOf(cart, variantId) };
    } catch (err) {
      const kind = classifyCartError(err);
      const known = fail(kind);
      if (known) return known;
      if (kind === "cart_invalid" && attempt === 0) {
        clearCartId(ctx);
        cartId = null;
        continue;
      }
      logError(ctx, op, err);
      return { code: "error", count: null };
    }
  }
  return { code: "error", count: null };
}

export const server = {
  // Mascotas (Fase M) dentro de `account.*`: mismo PRG y cookie flash (src/middleware.ts).
  account: { ...account, ...pets },
  checkout,
  wishlist,
  cart: {
    add: defineAction({
      accept: "form",
      input: z.object({
        variant_id: id.nullish(),
        product_id: id.nullish(),
        opcion_1: optionField,
        opcion_2: optionField,
        quantity: quantity.default(1),
        grams,
        preset: grams,
      }),
      handler: async (input, ctx): Promise<CartResult> => {
        const { quantity, grams, preset } = input;
        let variant_id: string | null;
        try {
          variant_id = await resolveVariant(input);
        } catch (err) {
          const known = fail(classifyCartError(err));
          if (known) return known;
          logError(ctx, "add", err);
          return { code: "error", count: null };
        }
        if (!variant_id) return { code: "variant", count: null };
        const wanted = preset ?? grams;
        let units = quantity;
        if (wanted != null) {
          try {
            // Granel (S-3): el paso y el mínimo salen de la variante (servidor), no del form.
            const rule = bulkRule(await getVariantMetadata(variant_id));
            if (!rule) return { code: "invalid", count: null };
            const cartId = getCartId(ctx);
            const current = cartId ? await retrieveCart(cartId).catch(() => null) : null;
            const already = (current?.completed_at ? [] : (current?.items ?? []))
              .filter((i) => i.variant_id === variant_id)
              .reduce((g, i) => g + (i.quantity ?? 0) * rule.stepG, 0);
            const check = checkGrams(wanted, rule, already);
            if (!check.ok) return { code: check.code, count: null };
            units = check.units;
          } catch (err) {
            const known = fail(classifyCartError(err));
            if (known) return known;
            logError(ctx, "add", err);
            return { code: "error", count: null };
          }
        }
        return addWithRetry(ctx, "add", variant_id!, units);
      },
    }),

    /**
     * Correa a medida (Fase E-2c, CorreaBuilder): el cliente manda el producto, el largo y los
     * mosquetones; la variante la busca el servidor en la metadata de las variantes del producto
     * (nunca se acepta un variant_id). Medida exacta en cm dentro del tramo del largo y
     * observaciones ≤ 200 caracteres: van en la metadata de la línea (el backend las vuelve a
     * validar, hook validar-carrito). Dos correas iguales con distinta medida u observaciones son
     * líneas distintas (Medusa solo junta líneas con la misma metadata).
     */
    addCorrea: defineAction({
      accept: "form",
      input: z.object({
        product_id: id,
        largo: z.number().int().min(1).max(100),
        perro: z.string().regex(/^[A-Z]{2,4}$/),
        mano: z.string().regex(/^[A-Z]{2,4}$/),
        medida_cm: z.number().int().min(1).max(10_000).nullish(),
        observaciones: z
          .string()
          .max(NOTES_MAX * 4)
          .nullish(),
        quantity: quantity.default(1),
      }),
      handler: async (input, ctx): Promise<CartResult> => {
        const { product_id, largo, perro, mano, medida_cm, quantity } = input;
        if (medida_cm != null) {
          const { minCm, maxCm } = exactRange(largo);
          if (medida_cm < minCm || medida_cm > maxCm) return { code: "correa", count: null };
        }
        const notes = cleanNotes(input.observaciones);
        if (notes === false) return { code: "correa", count: null };
        let variantId: string | null;
        try {
          variantId = findCorreaVariant(
            await getProductVariantsMeta(product_id),
            largo,
            perro,
            mano,
          );
        } catch (err) {
          logError(ctx, "addCorrea", err);
          return { code: "error", count: null };
        }
        if (!variantId) return { code: "invalid", count: null };
        const metadata: Record<string, unknown> = {};
        if (medida_cm != null) metadata[CORREA_LINE_META.exactCm] = medida_cm;
        if (notes) metadata[CORREA_LINE_META.notes] = notes;
        return addWithRetry(
          ctx,
          "addCorrea",
          variantId,
          quantity,
          Object.keys(metadata).length ? metadata : undefined,
        );
      },
    }),

    /**
     * Caja de snacks (Fase CS, diseño `caja`, CajaForm.astro): importe (variante) y «¿Para quién
     * es?». La variante tiene que ser del producto del formulario; los datos se limpian y validan
     * aquí (lib/line-data.ts `cajaFromForm`; la salud solo con el consentimiento) y otra vez en el
     * backend (hook validar-carrito). Una caja por envío del formulario (decisión del usuario),
     * siempre en su línea (`caja_ref` aleatorio) y con cantidad 1: 10 perros = 10 envíos, 10
     * líneas del mismo pedido. Campos vacíos llegan como null y las
     * casillas con el mismo nombre como array (astro-docs, actions: form data).
     */
    addCaja: defineAction({
      accept: "form",
      input: z.object({
        product_id: id,
        variant_id: id,
        animal: z.string().max(20).nullish(),
        nombre: z.string().max(200).nullish(),
        raza: z.string().max(200).nullish(),
        cachorro: z.boolean().nullish(),
        edad: z.number().nullish(),
        peso: z.number().nullish(),
        no_gusta: z.string().max(400).nullish(),
        probado: z.string().max(400).nullish(),
        pelo: z.string().max(20).nullish(),
        mastica: z.array(z.string().max(20)).max(5).nullish(),
        mastica_otro: z.string().max(200).nullish(),
        salud: z.string().max(400).nullish(),
        salud_ok: z.boolean().nullish(),
      }),
      handler: async (input, ctx): Promise<CartResult> => {
        // caja_ref aleatorio: cada envío es una caja distinta (Medusa junta las líneas con la
        // misma variante y la misma metadata; core-flows 2.22.2 find-matching-line-item)
        const result = cajaFromForm(input, crypto.randomUUID());
        if (!result.ok) return { code: "caja", count: null };
        try {
          const variants = await getProductVariantsMeta(input.product_id);
          if (!variants.some((v) => v.id === input.variant_id)) {
            return { code: "variant", count: null };
          }
        } catch (err) {
          logError(ctx, "addCaja", err);
          return { code: "error", count: null };
        }
        return addWithRetry(
          ctx,
          "addCaja",
          input.variant_id,
          1,
          result.data as unknown as Record<string, unknown>,
        );
      },
    }),

    update: defineAction({
      accept: "form",
      // quantity (o grams, granel) 0 = quitar la línea
      input: z
        .object({
          line_id: id,
          quantity: z.number().int().min(0).max(MAX_QUANTITY).nullish(),
          grams,
        })
        .refine((v) => v.quantity != null || v.grams != null),
      handler: async ({ line_id, quantity: qty, grams }, ctx): Promise<CartResult> => {
        const cartId = getCartId(ctx);
        if (!cartId) return { code: "expired", count: 0 };
        try {
          let quantity = qty ?? 0;
          if (grams != null) {
            // Granel (S-3): la regla es la de la variante de la línea (servidor).
            const line = (await retrieveCart(cartId)).items?.find((i) => i.id === line_id);
            const rule = line ? lineRule(line) : null;
            if (!rule) return { code: "invalid", count: null };
            if (grams === 0) quantity = 0;
            else {
              const check = checkGrams(grams, rule);
              if (!check.ok) return { code: check.code, count: null };
              quantity = check.units;
            }
          }
          if (quantity === 0) {
            const cart = await deleteLineItem(cartId, line_id);
            return { code: "removed", count: itemCount(cart) };
          }
          const cart = await updateLineItem(cartId, line_id, quantity);
          return { code: "updated", count: itemCount(cart) };
        } catch (err) {
          const kind = classifyCartError(err);
          const known = fail(kind);
          if (known) return known;
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
