// POST/Redirect/GET de las actions del carrito llamadas desde un <form> (fase 4).
// Fuente: astro-docs (reference/modules/astro-actions#getactioncontext, guides/actions
// "Advanced: Persist action results with a session" → aquí sin sesión: el aviso viaja en el
// fragmento de la URL de vuelta, `#carrito-<código>`, y lo muestra CSS con :target).
//   - Sin JS (Accept: text/html): 303 a `back` (ruta relativa validada) + `#carrito-<código>`.
//   - Con JS (fetch con Accept: application/json): JSON simple { code, count, msg }, sin devalue.
// Las llamadas RPC (/_actions/*) siguen el flujo normal de Astro. checkOrigin (por defecto)
// rechaza POST de formulario de otros orígenes antes de llegar aquí.
import { getActionContext } from "astro:actions";
import { defineMiddleware } from "astro:middleware";
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
  const { action } = getActionContext(context);
  if (action?.calledFrom !== "form" || !action.name.startsWith("cart.")) return next();

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
