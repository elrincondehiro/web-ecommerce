// Actions de los avisos de stock (Fase MK-B). Como las de la lista de deseos (Fase L-1):
// `accept: "form"`, sin JS con <form method="POST"> (el middleware responde 303 a `back` con
// `#aviso-<código>`) o JSON con JS (CartClient, botones [data-wish]). Sin sesión: el aviso queda
// pendiente en la cookie `stock_alert_pending` (10 min) y se va a «Entrar»; al entrar se crea.
// Fuente: astro-docs (guides/actions); diseño en docs/fases/faseMK-marketing.md §2.
import type { ActionAPIContext } from "astro:actions";
import { defineAction } from "astro:actions";
import { COOKIE_SECURE } from "astro:env/server";
import { z } from "astro/zod";
import { loginRedirect } from "$lib/account";
import { ID_PATTERN, safeBackPath } from "$lib/cart";
import { addStockAlert, removeStockAlert } from "$lib/medusa";
import {
  ALERT_PENDING_COOKIE,
  alertPendingCookieOptions,
  classifyAlertError,
  encodeAlertPending,
  type AlertResult,
} from "$lib/stock-alerts";
import { isProductId, isVariantId } from "$lib/wishlist";
import { resolveVariant } from "./resolve-variant";

function logError(ctx: ActionAPIContext, op: string, err: unknown): void {
  ctx.logger.error(`avisos ${op}: ${err instanceof Error ? err.message : String(err)}`);
}

const isUnauthorized = (err: unknown) => (err as { status?: unknown } | null)?.status === 401;

function toLogin(ctx: ActionAPIContext, back: string, pending?: string): AlertResult {
  if (pending) {
    ctx.cookies.set(ALERT_PENDING_COOKIE, pending, alertPendingCookieOptions(COOKIE_SECURE));
  }
  return { code: "alert_login", login: loginRedirect(back) };
}

export const stockAlert = {
  add: defineAction({
    accept: "form",
    input: z.object({
      product_id: z.string().refine(isProductId),
      // Tabla de variantes / una variante, o selector de opciones (Fase O): la busca el servidor.
      variant_id: z.string().refine(isVariantId).nullish(),
      opcion_1: z.string().min(3).max(200).nullish(),
      opcion_2: z.string().min(3).max(200).nullish(),
      back: z.string().max(512).nullish(),
    }),
    handler: async (input, ctx): Promise<AlertResult> => {
      const origin = safeBackPath(input.back);
      const variant_id = await resolveVariant(input).catch(() => null);
      if (!variant_id || !isVariantId(variant_id)) return { code: "alert_error" };
      const target = { product_id: input.product_id, variant_id };
      const token = ctx.locals.customerToken;
      if (!token) return toLogin(ctx, origin, encodeAlertPending(target));
      try {
        const { created } = await addStockAlert(token, target.product_id, target.variant_id);
        return { code: created ? "alert_added" : "alert_already" };
      } catch (err) {
        if (isUnauthorized(err)) return toLogin(ctx, origin, encodeAlertPending(target));
        const code = classifyAlertError(err);
        if (code === "alert_error") logError(ctx, "add", err);
        return { code };
      }
    },
  }),

  remove: defineAction({
    accept: "form",
    input: z.object({
      alert_id: z.string().regex(ID_PATTERN),
      back: z.string().max(512).nullish(),
    }),
    handler: async ({ alert_id, back }, ctx): Promise<AlertResult> => {
      const token = ctx.locals.customerToken;
      if (!token) return toLogin(ctx, safeBackPath(back));
      try {
        await removeStockAlert(token, alert_id);
        return { code: "alert_removed" };
      } catch (err) {
        if (isUnauthorized(err)) return toLogin(ctx, safeBackPath(back));
        logError(ctx, "remove", err);
        return { code: "alert_error" };
      }
    },
  }),
};
