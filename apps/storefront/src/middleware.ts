// POST/Redirect/GET de las actions del carrito llamadas desde un <form> (fase 4).
// Fuente: astro-docs (reference/modules/astro-actions#getactioncontext, guides/actions
// "Advanced: Persist action results with a session" → aquí sin sesión: el aviso viaja en el
// fragmento de la URL de vuelta, `#carrito-<código>`, y lo muestra CSS con :target).
//   - Sin JS (Accept: text/html): 303 a `back` (ruta relativa validada) + `#carrito-<código>`.
//   - Con JS (fetch con Accept: application/json): JSON simple { code, count, msg }, sin devalue.
// Las llamadas RPC (/_actions/*) siguen el flujo normal de Astro. checkOrigin (por defecto)
// rechaza POST de formulario de otros orígenes antes de llegar aquí.
// Checkout (fase 5): las actions `checkout.*` siempre responden 303 a /checkout/#<paso>; el
// aviso, los errores por campo y los valores viajan en la cookie flash (1 min, httpOnly).
// Cuenta (fase 9): `locals.customerToken` = JWT de la cookie `customer_token` si es de un cliente
// creado y no ha caducado (sin red: la firma la comprueba Medusa). Las actions `account.*`
// responden siempre 303 (PRG) al destino que devuelvan, con el aviso en la cookie flash.
import { getActionContext } from "astro:actions";
import { COOKIE_SECURE } from "astro:env/server";
import { defineMiddleware } from "astro:middleware";
import type { AccountResult } from "./actions/account";
import type { CheckoutResult } from "./actions/checkout";
import {
  ACCOUNT_FLASH_COOKIE,
  TOKEN_COOKIE,
  accountFlashCookieOptions,
  encodeAccountFlash,
  isSessionToken,
  readToken,
} from "$lib/account";
import { CHECKOUT_PATH, FLASH_COOKIE, encodeFlash, flashCookieOptions } from "$lib/checkout";
import {
  isErrorNotice,
  noticeMessage,
  redirectTarget,
  type CartResult,
  type NoticeCode,
} from "$lib/cart";

const NO_STORE = "private, no-store";

function toResult(result: { data?: unknown; error?: { code?: string } | undefined }): CartResult {
  if (result.error) {
    // ActionInputError (zod) → "invalid"; resto → "error"
    return { code: result.error.code === "BAD_REQUEST" ? "invalid" : "error", count: null };
  }
  return result.data as CartResult;
}

export const onRequest = defineMiddleware(async (context, next) => {
  // Las páginas prerenderizadas no tienen cookies (Astro avisa si se leen en el build).
  if (!context.isPrerendered) {
    const token = context.cookies.get(TOKEN_COOKIE)?.value;
    context.locals.customerToken = token && isSessionToken(readToken(token)) ? token : null;
  }

  const { action } = getActionContext(context);
  if (action?.calledFrom !== "form") return next();

  if (action.name.startsWith("account.")) {
    const result = await action.handler();
    const data: AccountResult = result.error
      ? { to: context.url.pathname, flash: { code: "error" } }
      : (result.data as AccountResult);
    if (data.flash) {
      context.cookies.set(
        ACCOUNT_FLASH_COOKIE,
        encodeAccountFlash(data.flash),
        accountFlashCookieOptions(COOKIE_SECURE),
      );
    }
    const response = context.redirect(data.to, 303);
    response.headers.set("Cache-Control", NO_STORE);
    return response;
  }

  if (action.name.startsWith("checkout.")) {
    const result = await action.handler();
    const data: CheckoutResult = result.error
      ? { step: "datos", flash: { code: "error" } }
      : (result.data as CheckoutResult);
    if (data.flash) {
      context.cookies.set(FLASH_COOKIE, encodeFlash(data.flash), flashCookieOptions(COOKIE_SECURE));
    }
    const target = data.step === "carrito" ? "/carrito/" : `${CHECKOUT_PATH}#${data.step}`;
    const response = context.redirect(target, 303);
    response.headers.set("Cache-Control", NO_STORE);
    return response;
  }

  if (!action.name.startsWith("cart.")) return next();

  const result = toResult(await action.handler());
  const code: NoticeCode = result.code;

  if (context.request.headers.get("accept")?.includes("application/json")) {
    return Response.json(
      { code, count: result.count, msg: noticeMessage(code, result.title) },
      { status: isErrorNotice(code) ? 422 : 200, headers: { "Cache-Control": NO_STORE } },
    );
  }

  // El body ya lo leyó la action sobre un clon: aquí se puede leer el original.
  const form = await context.request.formData().catch(() => null);
  const response = context.redirect(redirectTarget(form?.get("back"), code), 303);
  response.headers.set("Cache-Control", NO_STORE);
  return response;
});
