// Astro Actions del checkout (fase 5). Formularios sin JS que hacen POST a
// `/checkout/?_action=checkout.<x>`; el middleware responde con 303 a /checkout/#<paso> (PRG).
// Sin `input`: el handler recibe el FormData crudo (astro-docs, guides/actions "accept form")
// y la validación con mensajes por campo la hace lib/checkout.ts (parseAddressForm).
// Los errores no lanzan: devuelven un CheckoutResult y el middleware guarda el aviso, errores y
// valores en la cookie flash (1 min) que lee /checkout/.
import type { ActionAPIContext } from "astro:actions";
import { defineAction } from "astro:actions";
import { CART_COOKIE, ID_PATTERN, isValidId } from "$lib/cart";
import {
  STRIPE_PROVIDER_ID,
  classifyCompleteError,
  parseAddressForm,
  type CheckoutAddress,
  type Flash,
} from "$lib/checkout";
import { sameAddress } from "$lib/account";
import {
  CHECKOUT_FIELDS,
  createAddress,
  initiateStripeSession,
  retrieveCustomer,
  transferCart,
  listShippingOptions,
  retrieveCart,
  setShippingMethod,
  updateCartContact,
} from "$lib/medusa";

/** Resultado de una action del checkout: a dónde volver y qué mostrar. */
export interface CheckoutResult {
  /** Fragmento de /checkout/ al que volver (paso). "carrito" = volver a /carrito/. */
  step: "datos" | "envio" | "pago" | "carrito";
  flash?: Flash;
}

function cartIdOf(ctx: ActionAPIContext): string | null {
  const value = ctx.cookies.get(CART_COOKIE)?.value;
  return isValidId(value) ? value : null;
}

function logError(ctx: ActionAPIContext, op: string, err: unknown): void {
  // Sin datos personales: solo la operación y el mensaje de la Store API.
  ctx.logger.error(`checkout ${op}: ${err instanceof Error ? err.message : String(err)}`);
}

/**
 * Tras cambiar dirección o envío, deja preparada la sesión de Stripe para el total nuevo
 * (Medusa borra las sesiones si cambia el total). Se hace en el POST y no en el GET para no
 * crear un PaymentIntent cada vez que se recarga la página.
 */
async function prepareStripe(cartId: string): Promise<void> {
  const cart = await retrieveCart(cartId, CHECKOUT_FIELDS);
  if (!cart.shipping_methods?.length) return;
  await initiateStripeSession(cart, STRIPE_PROVIDER_ID);
}

/**
 * Cliente con sesión (fase 9): el carrito pasa a ser suyo (el pedido sale en "Mis pedidos"
 * aunque el carrito se creara antes de entrar) y, si lo pide, guarda la dirección de envío (si
 * no la tiene ya). Si falla, el checkout sigue como invitado.
 */
async function linkCustomer(
  ctx: ActionAPIContext,
  token: string,
  cartId: string,
  save: boolean,
  shipping: CheckoutAddress,
): Promise<void> {
  try {
    await transferCart(token, cartId);
    if (!save) return;
    const customer = await retrieveCustomer(token);
    const addresses = customer.addresses ?? [];
    if (addresses.some((a) => sameAddress(a, shipping))) return;
    await createAddress(token, { ...shipping, is_default_shipping: addresses.length === 0 });
  } catch (err) {
    logError(ctx, "cuenta", err);
  }
}

export const checkout = {
  address: defineAction({
    accept: "form",
    handler: async (form, ctx): Promise<CheckoutResult> => {
      const cartId = cartIdOf(ctx);
      if (!cartId) return { step: "carrito" };
      const parsed = parseAddressForm(form);
      if (!parsed.ok) {
        return {
          step: "datos",
          flash: { code: "invalid", errors: parsed.errors, values: parsed.values },
        };
      }
      try {
        const { email, shipping, billing } = parsed.data;
        const token = ctx.locals.customerToken;
        if (token)
          await linkCustomer(ctx, token, cartId, form.get("save_address") === "on", shipping);
        await updateCartContact(cartId, {
          email,
          shipping_address: shipping,
          billing_address: billing,
        });
        await prepareStripe(cartId);
        return { step: "envio" };
      } catch (err) {
        const code = classifyCompleteError(err);
        if (code === "expired") return { step: "carrito" };
        logError(ctx, "address", err);
        return { step: "datos", flash: { code: "error" } };
      }
    },
  }),

  shipping: defineAction({
    accept: "form",
    handler: async (form, ctx): Promise<CheckoutResult> => {
      const cartId = cartIdOf(ctx);
      if (!cartId) return { step: "carrito" };
      const optionId = form.get("option_id");
      if (typeof optionId !== "string" || !ID_PATTERN.test(optionId)) {
        return { step: "envio", flash: { code: "shipping" } };
      }
      try {
        // Solo opciones válidas para ESTE carrito (zona/dirección); el precio lo pone Medusa.
        const options = await listShippingOptions(cartId);
        if (!options.some((o) => o.id === optionId && !o.insufficient_inventory)) {
          return { step: "envio", flash: { code: "shipping" } };
        }
        await setShippingMethod(cartId, optionId);
        await prepareStripe(cartId);
        return { step: "pago" };
      } catch (err) {
        const code = classifyCompleteError(err);
        if (code === "expired") return { step: "carrito" };
        logError(ctx, "shipping", err);
        return { step: "envio", flash: { code: code === "stock" ? "stock" : "error" } };
      }
    },
  }),

  /** Reintento manual de la sesión de pago (si no se pudo crear o caducó). */
  payment: defineAction({
    accept: "form",
    handler: async (_form, ctx): Promise<CheckoutResult> => {
      const cartId = cartIdOf(ctx);
      if (!cartId) return { step: "carrito" };
      try {
        await prepareStripe(cartId);
        return { step: "pago" };
      } catch (err) {
        logError(ctx, "payment", err);
        return { step: "pago", flash: { code: "error" } };
      }
    },
  }),
};
