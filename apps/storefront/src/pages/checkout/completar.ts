// Completar el pedido (fase 5). GET porque es el `return_url` de Stripe (vuelve con
// ?payment_intent=…&redirect_status=…) y también lo llama el script de pago tras autorizar sin
// redirección. `cart.complete` es idempotente en Medusa 2.21.2 (lock por carrito + order_cart):
// si el webhook ya creó el pedido, devuelve el mismo; recargar esta URL no duplica nada.
// - OK   → borra cart_id, guarda last_order (1 h, solo /pedido/) y 303 a /pedido/<id>/.
// - Pago no autorizado / fallido → 303 a /checkout/#pago con aviso (cookie flash).
// - Sin carrito → /carrito/.
import type { APIRoute } from "astro";
import { COOKIE_SECURE } from "astro:env/server";
import { CART_COOKIE, isValidId } from "$lib/cart";
import {
  CHECKOUT_PATH,
  FLASH_COOKIE,
  LAST_ORDER_COOKIE,
  classifyCompleteError,
  encodeFlash,
  flashCookieOptions,
  lastOrderCookieOptions,
  orderPath,
  stripeRedirectFailed,
  type CheckoutNoticeCode,
} from "$lib/checkout";
import { completeCart } from "$lib/medusa";

export const prerender = false;

const NO_STORE = { "Cache-Control": "private, no-store" };

export const GET: APIRoute = async ({ cookies, url, redirect, logger }) => {
  const back = (code: CheckoutNoticeCode) => {
    cookies.set(FLASH_COOKIE, encodeFlash({ code }), flashCookieOptions(COOKIE_SECURE));
    const res = redirect(`${CHECKOUT_PATH}#pago`, 303);
    for (const [k, v] of Object.entries(NO_STORE)) res.headers.set(k, v);
    return res;
  };

  const cartId = cookies.get(CART_COOKIE)?.value;
  if (!isValidId(cartId)) return redirect("/carrito/", 303);

  if (stripeRedirectFailed(url.searchParams.get("redirect_status"))) return back("payment_failed");

  try {
    const result = await completeCart(cartId);
    if (result.type === "cart") {
      const code = classifyCompleteError(result.error.message);
      if (code === "expired") return redirect("/carrito/", 303);
      if (code === "error") logger.error(`checkout completar: ${result.error.message}`);
      return back(code);
    }
    const orderId = result.order.id;
    cookies.delete(CART_COOKIE, { path: "/" });
    cookies.set(LAST_ORDER_COOKIE, orderId, lastOrderCookieOptions(COOKIE_SECURE));
    const res = redirect(orderPath(orderId), 303);
    for (const [k, v] of Object.entries(NO_STORE)) res.headers.set(k, v);
    return res;
  } catch (err) {
    const code = classifyCompleteError(err);
    if (code === "expired") return redirect("/carrito/", 303);
    if (code === "error") {
      logger.error(`checkout completar: ${err instanceof Error ? err.message : String(err)}`);
    }
    return back(code);
  }
};
