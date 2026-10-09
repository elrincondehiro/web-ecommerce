// Astro Actions de la cuenta de cliente (fase 9). Formularios sin JS que hacen POST a
// `<página de /cuenta/>?_action=account.<x>`; el middleware responde con 303 al destino `to`
// (PRG) y guarda el aviso, los errores y los valores en la cookie flash (1 min). Sin `input`:
// el handler recibe el FormData crudo y la validación con mensajes por campo está en
// lib/account.ts (como el checkout, fase 5). Los errores no lanzan: devuelven un AccountResult.
// Fuente: astro-docs (guides/actions "accept form", getActionContext); flujo de Medusa en
// lib/medusa.ts (sección "Cuenta de cliente").
//
// Privacidad: nunca se registran emails, contraseñas ni tokens; los avisos no revelan si un
// email tiene cuenta (registro y "recuperar" responden igual en ambos casos).
import type { ActionAPIContext } from "astro:actions";
import { defineAction } from "astro:actions";
import { COOKIE_SECURE } from "astro:env/server";
import {
  ACCOUNT_PATH,
  ADDRESSES_PATH,
  DELETE_PATH,
  LOGIN_PATH,
  PROFILE_PATH,
  RECOVER_PATH,
  REGISTER_PATH,
  RESET_PATH,
  TOKEN_COOKIE,
  isIdentityExists,
  isUnauthorized,
  loginRedirect,
  parseDeleteForm,
  parseEmail,
  parseLoginForm,
  parseProfileForm,
  parseRegisterForm,
  parseResetForm,
  parseSavedAddressForm,
  readToken,
  safeNext,
  tokenCookieOptions,
  tokenMaxAge,
  type AccountFlash,
} from "$lib/account";
import { CART_COOKIE, cartCookieOptions, isValidId } from "$lib/cart";
import {
  confirmEmailVerification,
  createAddress,
  createCustomer,
  deleteAddress,
  latestCustomerCartId,
  loginCustomer,
  registerIdentity,
  requestAccountDeletion,
  requestEmailVerification,
  requestPasswordReset,
  resetPassword,
  retrieveCart,
  retrieveCustomer,
  transferCart,
  updateAddress,
  updateCustomer,
} from "$lib/medusa";

/** Resultado de una action de cuenta: a dónde volver (ruta propia) y qué mostrar. */
export interface AccountResult {
  to: string;
  flash?: AccountFlash;
}

function logError(ctx: ActionAPIContext, op: string, err: unknown): void {
  // Sin datos personales: solo la operación y el mensaje de la API.
  ctx.logger.error(`cuenta ${op}: ${err instanceof Error ? err.message : String(err)}`);
}

function setSession(ctx: ActionAPIContext, token: string): void {
  ctx.cookies.set(
    TOKEN_COOKIE,
    token,
    tokenCookieOptions(COOKIE_SECURE, tokenMaxAge(readToken(token))),
  );
}

function clearSession(ctx: ActionAPIContext): void {
  ctx.cookies.delete(TOKEN_COOKIE, { path: "/" });
}

/** Token de la sesión (lo valida el middleware) o null → volver a "Entrar". */
function sessionOf(ctx: ActionAPIContext): string | null {
  return ctx.locals.customerToken ?? null;
}

const expired = (back: string): AccountResult => ({
  to: loginRedirect(back),
  flash: { code: "session_expired" },
});

/**
 * Tras un login con token "sin cliente" (primer acceso tras verificar): crea el cliente y vuelve
 * a iniciar sesión para obtener un token con `actor_id` (la guía de Medusa no usa refresh).
 */
async function ensureCustomer(token: string, email: string, password: string): Promise<string> {
  if (readToken(token)?.actorId) return token;
  await createCustomer(token, email);
  const again = await loginCustomer(email, password);
  if (again.type !== "token" || !readToken(again.token)?.actorId) {
    throw new Error("El token tras crear el cliente no tiene actor_id");
  }
  return again.token;
}

/**
 * Carrito al entrar (opción a, fase 9). Si falla, no impide entrar.
 * - El navegador tiene carrito → pasa a ser del cliente (gana el del navegador; el anterior de
 *   la cuenta se queda guardado en Medusa).
 * - No tiene → se carga el último carrito del cliente (otro dispositivo o una sesión anterior).
 */
async function adoptCart(ctx: ActionAPIContext, token: string): Promise<void> {
  const cartId = ctx.cookies.get(CART_COOKIE)?.value;
  try {
    if (isValidId(cartId)) {
      const cart = await retrieveCart(cartId).catch(() => null);
      // Carrito inexistente o ya pagado: como si no hubiera (se busca el de la cuenta).
      if (cart && !cart.completed_at) {
        await transferCart(token, cartId);
        return;
      }
    }
    const latest = await latestCustomerCartId(token);
    if (latest) ctx.cookies.set(CART_COOKIE, latest, cartCookieOptions(COOKIE_SECURE));
  } catch (err) {
    logError(ctx, "carrito al entrar", err);
  }
}

export const account = {
  register: defineAction({
    accept: "form",
    handler: async (form, ctx): Promise<AccountResult> => {
      const parsed = parseRegisterForm(form);
      if (!parsed.ok) {
        return {
          to: REGISTER_PATH,
          flash: { code: "invalid", errors: parsed.errors, values: parsed.values },
        };
      }
      const { email, password } = parsed.data;
      try {
        await registerIdentity(email, password);
      } catch (err) {
        // Ya existe (cliente o admin): mismo aviso que un registro nuevo para no revelarlo. Si
        // la contraseña es la suya, el login de abajo sigue el flujo normal.
        if (!isIdentityExists(err)) {
          logError(ctx, "registro", err);
          return { to: REGISTER_PATH, flash: { code: "error", values: { email } } };
        }
      }
      try {
        const login = await loginCustomer(email, password);
        if (login.type === "verify") await requestEmailVerification(login.token, email);
      } catch (err) {
        // 401 = email existente con otra contraseña: no se dice nada distinto.
        if (!isUnauthorized(err)) logError(ctx, "registro (verificación)", err);
      }
      return { to: LOGIN_PATH, flash: { code: "verify_sent", values: { email } } };
    },
  }),

  login: defineAction({
    accept: "form",
    handler: async (form, ctx): Promise<AccountResult> => {
      const next = safeNext(form.get("next"));
      const back = next === ACCOUNT_PATH ? LOGIN_PATH : loginRedirect(next);
      const parsed = parseLoginForm(form);
      if (!parsed.ok) {
        return {
          to: back,
          flash: { code: "invalid", errors: parsed.errors, values: parsed.values },
        };
      }
      const { email, password } = parsed.data;
      try {
        const login = await loginCustomer(email, password);
        if (login.type === "verify") {
          // Email sin confirmar: se reenvía el enlace (Medusa limita la frecuencia por su cuenta).
          await requestEmailVerification(login.token, email);
          return { to: back, flash: { code: "verify_sent", values: { email } } };
        }
        const token = await ensureCustomer(login.token, email, password);
        setSession(ctx, token);
        await adoptCart(ctx, token);
        return { to: next };
      } catch (err) {
        if (isUnauthorized(err)) {
          return { to: back, flash: { code: "login_failed", values: { email } } };
        }
        logError(ctx, "entrar", err);
        return { to: back, flash: { code: "error", values: { email } } };
      }
    },
  }),

  logout: defineAction({
    accept: "form",
    handler: async (_form, ctx): Promise<AccountResult> => {
      // El JWT no se puede revocar en Medusa: se borra la cookie (caduca a los 7 días).
      clearSession(ctx);
      // El carrito ya es del cliente: no se deja en este navegador tras salir (ordenador
      // compartido). Sigue en la cuenta y se recupera al volver a entrar (adoptCart).
      ctx.cookies.delete(CART_COOKIE, { path: "/" });
      return { to: LOGIN_PATH, flash: { code: "logged_out" } };
    },
  }),

  recover: defineAction({
    accept: "form",
    handler: async (form, ctx): Promise<AccountResult> => {
      const raw = typeof form.get("email") === "string" ? String(form.get("email")) : "";
      const email = parseEmail(raw);
      if (!email) {
        return {
          to: RECOVER_PATH,
          flash: {
            code: "invalid",
            errors: { email: "Escribe un email válido." },
            values: { email: raw.slice(0, 254) },
          },
        };
      }
      try {
        await requestPasswordReset(email);
      } catch (err) {
        logError(ctx, "recuperar", err);
      }
      // Mismo aviso exista o no la cuenta (y aunque falle el envío).
      return { to: RECOVER_PATH, flash: { code: "recover_sent" } };
    },
  }),

  reset: defineAction({
    accept: "form",
    handler: async (form, ctx): Promise<AccountResult> => {
      const parsed = parseResetForm(form);
      const token = typeof form.get("token") === "string" ? String(form.get("token")) : "";
      // El token vuelve en la URL (no en la cookie flash): ya estaba en el enlace del email.
      const back =
        token && token.length <= 4096
          ? `${RESET_PATH}?token=${encodeURIComponent(token)}`
          : RESET_PATH;
      if (!parsed.ok) {
        if (parsed.errors.token) return { to: RECOVER_PATH, flash: { code: "reset_failed" } };
        return { to: back, flash: { code: "invalid", errors: parsed.errors } };
      }
      try {
        await resetPassword(parsed.data.token, parsed.data.password);
        clearSession(ctx);
        return { to: LOGIN_PATH, flash: { code: "reset_done" } };
      } catch (err) {
        if (!isUnauthorized(err)) logError(ctx, "restablecer", err);
        return { to: RECOVER_PATH, flash: { code: "reset_failed" } };
      }
    },
  }),

  verify: defineAction({
    accept: "form",
    handler: async (form, ctx): Promise<AccountResult> => {
      const code = form.get("token");
      if (typeof code !== "string" || !code || code.length > 512) {
        return { to: LOGIN_PATH, flash: { code: "verify_failed" } };
      }
      try {
        await confirmEmailVerification(code);
        return { to: LOGIN_PATH, flash: { code: "verified" } };
      } catch (err) {
        // 400 "Verification code is invalid or already used" (Medusa 2.21.2).
        if ((err as { status?: unknown } | null)?.status !== 400) logError(ctx, "verificar", err);
        return { to: LOGIN_PATH, flash: { code: "verify_failed" } };
      }
    },
  }),

  profile: defineAction({
    accept: "form",
    handler: async (form, ctx): Promise<AccountResult> => {
      const token = sessionOf(ctx);
      if (!token) return expired(PROFILE_PATH);
      const parsed = parseProfileForm(form);
      if (!parsed.ok) {
        return {
          to: PROFILE_PATH,
          flash: { code: "invalid", errors: parsed.errors, values: parsed.values },
        };
      }
      try {
        const { first_name, last_name, phone } = parsed.data;
        await updateCustomer(token, { first_name, last_name, phone: phone || null });
        return { to: PROFILE_PATH, flash: { code: "saved" } };
      } catch (err) {
        if (isUnauthorized(err)) return expired(PROFILE_PATH);
        logError(ctx, "datos", err);
        return { to: PROFILE_PATH, flash: { code: "error", values: { ...parsed.data } } };
      }
    },
  }),

  /** Cambiar contraseña (opción a): se envía el mismo enlace que en "¿Olvidaste tu contraseña?". */
  password: defineAction({
    accept: "form",
    handler: async (_form, ctx): Promise<AccountResult> => {
      const token = sessionOf(ctx);
      if (!token) return expired(PROFILE_PATH);
      try {
        const customer = await retrieveCustomer(token);
        await requestPasswordReset(customer.email);
        return { to: PROFILE_PATH, flash: { code: "password_sent" } };
      } catch (err) {
        if (isUnauthorized(err)) return expired(PROFILE_PATH);
        logError(ctx, "cambiar contraseña", err);
        return { to: PROFILE_PATH, flash: { code: "error" } };
      }
    },
  }),

  addressSave: defineAction({
    accept: "form",
    handler: async (form, ctx): Promise<AccountResult> => {
      const token = sessionOf(ctx);
      if (!token) return expired(ADDRESSES_PATH);
      const idRaw = form.get("address_id");
      const addressId = typeof idRaw === "string" && idRaw ? idRaw : null;
      if (addressId !== null && !isValidId(addressId)) {
        return { to: ADDRESSES_PATH, flash: { code: "error" } };
      }
      const formAnchor = addressId ? `#editar-${addressId}` : "#nueva";
      const parsed = parseSavedAddressForm(form);
      if (!parsed.ok) {
        return {
          to: `${ADDRESSES_PATH}${addressId ? `?editar=${addressId}` : ""}${formAnchor}`,
          flash: { code: "invalid", errors: parsed.errors, values: parsed.values },
        };
      }
      const { address_name, is_default_shipping, ...address } = parsed.data;
      const body = {
        ...address,
        address_name: address_name || null,
        // Solo se marca: desmarcar la predeterminada se hace eligiendo otra.
        ...(is_default_shipping ? { is_default_shipping: true } : {}),
      };
      try {
        if (addressId) await updateAddress(token, addressId, body);
        else await createAddress(token, body);
        return { to: ADDRESSES_PATH, flash: { code: "address_saved" } };
      } catch (err) {
        if (isUnauthorized(err)) return expired(ADDRESSES_PATH);
        logError(ctx, "guardar dirección", err);
        const { is_default_shipping: def, ...rest } = parsed.data;
        return {
          to: `${ADDRESSES_PATH}${addressId ? `?editar=${addressId}` : ""}${formAnchor}`,
          flash: { code: "error", values: { ...rest, is_default: def ? "on" : "" } },
        };
      }
    },
  }),

  addressDelete: defineAction({
    accept: "form",
    handler: async (form, ctx): Promise<AccountResult> => {
      const token = sessionOf(ctx);
      if (!token) return expired(ADDRESSES_PATH);
      const addressId = form.get("address_id");
      if (typeof addressId !== "string" || !isValidId(addressId)) {
        return { to: ADDRESSES_PATH, flash: { code: "error" } };
      }
      try {
        // Medusa solo borra direcciones del cliente del token (404 si es de otro).
        await deleteAddress(token, addressId);
        return { to: ADDRESSES_PATH, flash: { code: "address_deleted" } };
      } catch (err) {
        if (isUnauthorized(err)) return expired(ADDRESSES_PATH);
        logError(ctx, "borrar dirección", err);
        return { to: ADDRESSES_PATH, flash: { code: "error" } };
      }
    },
  }),

  addressDefault: defineAction({
    accept: "form",
    handler: async (form, ctx): Promise<AccountResult> => {
      const token = sessionOf(ctx);
      if (!token) return expired(ADDRESSES_PATH);
      const addressId = form.get("address_id");
      if (typeof addressId !== "string" || !isValidId(addressId)) {
        return { to: ADDRESSES_PATH, flash: { code: "error" } };
      }
      try {
        // Medusa desmarca la anterior (maybeUnsetDefaultShippingAddressesStep).
        await updateAddress(token, addressId, { is_default_shipping: true });
        return { to: ADDRESSES_PATH, flash: { code: "saved" } };
      } catch (err) {
        if (isUnauthorized(err)) return expired(ADDRESSES_PATH);
        logError(ctx, "dirección predeterminada", err);
        return { to: ADDRESSES_PATH, flash: { code: "error" } };
      }
    },
  }),

  deleteRequest: defineAction({
    accept: "form",
    handler: async (form, ctx): Promise<AccountResult> => {
      const token = sessionOf(ctx);
      if (!token) return expired(DELETE_PATH);
      const parsed = parseDeleteForm(form);
      if (!parsed.ok) {
        return {
          to: DELETE_PATH,
          flash: { code: "invalid", errors: parsed.errors, values: parsed.values },
        };
      }
      try {
        await requestAccountDeletion(token, parsed.data.reason);
        return { to: ACCOUNT_PATH, flash: { code: "delete_sent" } };
      } catch (err) {
        if (isUnauthorized(err)) return expired(DELETE_PATH);
        logError(ctx, "solicitud de baja", err);
        return {
          to: DELETE_PATH,
          flash: { code: "error", values: { reason: parsed.data.reason } },
        };
      }
    },
  }),
};
