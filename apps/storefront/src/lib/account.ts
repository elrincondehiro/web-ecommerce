// Cuenta de cliente (fase 9): funciones PURAS (sin astro:* ni I/O) para poder testearlas con
// Vitest. La I/O contra Medusa está en lib/medusa.ts, la orquestación en src/actions/account.ts y
// el middleware lee la sesión (src/middleware.ts). Ver docs/fases/fase9.md.
//
// Sesión: el JWT de Medusa (`emailpass`, 7 días, `http.jwtExpiresIn`) va en la cookie httpOnly
// `customer_token`; el servidor de Astro lo pasa como `Authorization: Bearer` (nunca llega al JS
// del navegador ni a localStorage, AGENTS §3.2). Medusa valida la firma en cada petición: aquí
// solo se LEE el payload (sin verificar) para saber si el cliente ya está creado y si ha caducado.
import { z } from "astro/zod";
import { checkShippingPostalCode, normalizePhone } from "./checkout";

export const ACCOUNT_PATH = "/cuenta/";
export const LOGIN_PATH = "/cuenta/entrar/";
export const REGISTER_PATH = "/cuenta/registro/";
export const RECOVER_PATH = "/cuenta/recuperar/";
export const RESET_PATH = "/cuenta/restablecer/";
export const VERIFY_PATH = "/cuenta/verificar/";
export const PROFILE_PATH = "/cuenta/datos/";
export const ADDRESSES_PATH = "/cuenta/direcciones/";
export const ORDERS_PATH = "/cuenta/pedidos/";
export const DELETE_PATH = "/cuenta/eliminar/";

export function accountOrderPath(orderId: string): string {
  return `${ORDERS_PATH}${orderId}/`;
}

export type AccountActionName =
  | "account.register"
  | "account.login"
  | "account.logout"
  | "account.recover"
  | "account.reset"
  | "account.verify"
  | "account.profile"
  | "account.password"
  | "account.addressSave"
  | "account.addressDelete"
  | "account.addressDefault"
  | "account.deleteRequest";

/** URL de un formulario sin JS: `<página>?_action=<nombre>` (la página debe ser on-demand). */
export function accountActionUrl(page: string, name: AccountActionName): string {
  return `${page}?_action=${name}`;
}

// ── Cookies ────────────────────────────────────────────────────────────────────────────────

export const TOKEN_COOKIE = "customer_token";
/** Igual que `http.jwtExpiresIn` del backend (7 días). */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

export function tokenCookieOptions(secure: boolean, maxAge = SESSION_MAX_AGE) {
  return { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge };
}

/** Aviso + errores + valores tras un POST sin JS (PRG), como el checkout. 1 min, httpOnly. */
export const ACCOUNT_FLASH_COOKIE = "account_flash";
export function accountFlashCookieOptions(secure: boolean) {
  return { httpOnly: true, secure, sameSite: "lax" as const, path: ACCOUNT_PATH, maxAge: 60 };
}

export const ACCOUNT_NOTICES = {
  invalid: "Revisa los campos marcados.",
  login_failed: "Email o contraseña incorrectos.",
  verify_sent:
    "Te hemos enviado un email para confirmar tu dirección. Pulsa el enlace y vuelve a entrar.",
  verified: "¡Email confirmado! Ya puedes entrar en tu cuenta.",
  verify_failed:
    "El enlace no es válido o ha caducado. Entra con tu email y contraseña y te enviaremos otro.",
  recover_sent:
    "Si hay una cuenta con ese email, te hemos enviado un enlace para crear una contraseña nueva.",
  reset_done: "Contraseña cambiada. Ya puedes entrar con la nueva.",
  reset_failed: "El enlace no es válido o ha caducado. Pide otro.",
  password_sent: "Te hemos enviado un email con un enlace para cambiar la contraseña.",
  saved: "Cambios guardados.",
  address_saved: "Dirección guardada.",
  address_deleted: "Dirección eliminada.",
  delete_sent:
    "Hemos recibido tu solicitud. Eliminaremos tu cuenta y te escribiremos en un plazo máximo de un mes.",
  logged_out: "Has cerrado la sesión.",
  session_expired: "Tu sesión ha caducado. Vuelve a entrar.",
  error: "Ha ocurrido un error. Inténtalo de nuevo.",
} as const;
export type AccountNoticeCode = keyof typeof ACCOUNT_NOTICES;

/** Avisos de éxito (verde); el resto se pintan como error. */
const SUCCESS = new Set<AccountNoticeCode>([
  "verify_sent",
  "verified",
  "recover_sent",
  "reset_done",
  "password_sent",
  "saved",
  "address_saved",
  "address_deleted",
  "delete_sent",
  "logged_out",
]);
export function isSuccessNotice(code: AccountNoticeCode): boolean {
  return SUCCESS.has(code);
}

export interface AccountFlash {
  code?: AccountNoticeCode;
  errors?: Record<string, string>;
  values?: Record<string, string>;
}

const MAX_FLASH = 3000;

export function encodeAccountFlash(flash: AccountFlash): string {
  return JSON.stringify(flash);
}

/** Lee la cookie flash; ante cualquier dato inesperado devuelve `{}` (nunca lanza). */
export function decodeAccountFlash(raw: string | undefined): AccountFlash {
  if (!raw || raw.length > MAX_FLASH) return {};
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object") return {};
    const { code, errors, values } = data as Record<string, unknown>;
    const out: AccountFlash = {};
    if (typeof code === "string" && code in ACCOUNT_NOTICES) out.code = code as AccountNoticeCode;
    const strings = (v: unknown) =>
      v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v).filter(
              (e): e is [string, string] => typeof e[1] === "string" && e[1].length <= 300,
            ),
          )
        : undefined;
    const e = strings(errors);
    const v = strings(values);
    if (e) out.errors = e;
    if (v) out.values = v;
    return out;
  } catch {
    return {};
  }
}

// ── Token (JWT de Medusa) ──────────────────────────────────────────────────────────────────

export interface TokenPayload {
  /** Id del cliente (`cus_…`); vacío si la identidad aún no tiene cliente. */
  actorId: string;
  /** Caducidad (segundos Unix). */
  exp: number;
}

/**
 * Lee el payload de un JWT SIN verificar la firma (eso lo hace Medusa en cada petición). Sirve
 * para decidir el flujo (¿falta crear el cliente?) y la caducidad de la cookie.
 */
export function readToken(token: string | undefined | null): TokenPayload | null {
  if (!token || token.length > 4096) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    const data = JSON.parse(json) as { actor_id?: unknown; actor_type?: unknown; exp?: unknown };
    if (data.actor_type !== "customer") return null;
    const exp = typeof data.exp === "number" ? data.exp : 0;
    return { actorId: typeof data.actor_id === "string" ? data.actor_id : "", exp };
  } catch {
    return null;
  }
}

/** ¿Token de un cliente creado y sin caducar? (`now` en ms). */
export function isSessionToken(payload: TokenPayload | null, now = Date.now()): boolean {
  return Boolean(payload?.actorId) && (payload?.exp ?? 0) * 1000 > now;
}

/** maxAge de la cookie: hasta la caducidad del token (máx. SESSION_MAX_AGE). */
export function tokenMaxAge(payload: TokenPayload | null, now = Date.now()): number {
  if (!payload?.exp) return SESSION_MAX_AGE;
  const secs = Math.floor(payload.exp - now / 1000);
  return Math.max(0, Math.min(SESSION_MAX_AGE, secs));
}

// ── Redirecciones ──────────────────────────────────────────────────────────────────────────

/**
 * Destino tras entrar: solo rutas relativas propias (sin `//`, sin esquema) para no abrir una
 * redirección a otro dominio. Por defecto, /cuenta/.
 */
export function safeNext(value: unknown): string {
  if (typeof value !== "string" || value.length > 200) return ACCOUNT_PATH;
  if (!/^\/(?![/\\])[\w\-./?=&%#]*$/.test(value)) return ACCOUNT_PATH;
  // Las páginas de entrar/registrarse no tienen sentido como destino.
  if (/^\/cuenta\/(entrar|registro|recuperar|restablecer|verificar)\//.test(value)) {
    return ACCOUNT_PATH;
  }
  return value;
}

export function loginRedirect(next?: string): string {
  const target = next ? safeNext(next) : ACCOUNT_PATH;
  return target === ACCOUNT_PATH ? LOGIN_PATH : `${LOGIN_PATH}?next=${encodeURIComponent(target)}`;
}

// ── Validación de formularios ──────────────────────────────────────────────────────────────

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

const get = (form: FormData, k: string) => {
  const v = form.get(k);
  return typeof v === "string" ? v : "";
};

export function parseEmail(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  const res = z.email().max(254).safeParse(v);
  return res.success ? res.data : null;
}

export function checkPassword(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `Mínimo ${PASSWORD_MIN} caracteres.`;
  if (password.length > PASSWORD_MAX) return `Máximo ${PASSWORD_MAX} caracteres.`;
  if (!/[A-Za-zÀ-ÿ]/.test(password) || !/\d/.test(password)) {
    return "Usa al menos una letra y un número.";
  }
  return null;
}

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: Record<string, string>; values: Record<string, string> };

/** Registro: email + contraseña + aceptación de condiciones. Nunca se devuelve la contraseña. */
export function parseRegisterForm(
  form: FormData,
): ParseResult<{ email: string; password: string }> {
  const values = { email: get(form, "email").slice(0, 254) };
  const errors: Record<string, string> = {};
  const email = parseEmail(values.email);
  if (!email) errors.email = "Escribe un email válido.";
  const password = get(form, "password");
  const pwError = checkPassword(password);
  if (pwError) errors.password = pwError;
  if (get(form, "terms") !== "on") {
    errors.terms = "Tienes que aceptar las condiciones y la política de privacidad.";
  }
  if (!email || Object.keys(errors).length) return { ok: false, errors, values };
  return { ok: true, data: { email, password } };
}

/** Entrar: email + contraseña (sin reglas de complejidad: las de la cuenta ya existente). */
export function parseLoginForm(form: FormData): ParseResult<{ email: string; password: string }> {
  const values = { email: get(form, "email").slice(0, 254) };
  const errors: Record<string, string> = {};
  const email = parseEmail(values.email);
  if (!email) errors.email = "Escribe un email válido.";
  const password = get(form, "password");
  if (!password || password.length > PASSWORD_MAX) errors.password = "Escribe tu contraseña.";
  if (!email || Object.keys(errors).length) return { ok: false, errors, values };
  return { ok: true, data: { email, password } };
}

/** Restablecer: token del enlace + contraseña nueva (dos veces). */
export function parseResetForm(form: FormData): ParseResult<{ token: string; password: string }> {
  const errors: Record<string, string> = {};
  const token = get(form, "token");
  const password = get(form, "password");
  const pwError = checkPassword(password);
  if (pwError) errors.password = pwError;
  else if (get(form, "password_confirm") !== password) {
    errors.password_confirm = "Las contraseñas no coinciden.";
  }
  if (!token || token.length > 4096) errors.token = "Enlace no válido.";
  if (Object.keys(errors).length) return { ok: false, errors, values: {} };
  return { ok: true, data: { token, password } };
}

const text = (max: number, msg: string) =>
  z
    .string()
    .trim()
    .min(1, msg)
    .max(max, `Máximo ${max} caracteres.`)
    // eslint-disable-next-line no-control-regex -- se rechazan caracteres de control a propósito
    .refine((s) => !/[\u0000-\u001f\u007f]/.test(s), "Caracteres no válidos.");

export const PROFILE_FIELDS = ["first_name", "last_name", "phone"] as const;

export interface ProfileData {
  first_name: string;
  last_name: string;
  /** "" = sin teléfono. */
  phone: string;
}

/** Mis datos: nombre y apellidos obligatorios; teléfono opcional (validado si se escribe). */
export function parseProfileForm(form: FormData): ParseResult<ProfileData> {
  const values: Record<string, string> = {};
  for (const k of PROFILE_FIELDS) values[k] = get(form, k).slice(0, 300);
  const errors: Record<string, string> = {};
  const res = z
    .object({
      first_name: text(80, "Escribe tu nombre."),
      last_name: text(80, "Escribe tus apellidos."),
    })
    .safeParse(values);
  if (!res.success) {
    for (const issue of res.error.issues) errors[String(issue.path[0])] ??= issue.message;
  }
  const rawPhone = (values.phone ?? "").trim();
  const phone = rawPhone ? normalizePhone(rawPhone) : "";
  if (phone === null) errors.phone = "Escribe un teléfono válido (p. ej. 600 123 456).";
  if (!res.success || phone === null || Object.keys(errors).length) {
    return { ok: false, errors, values };
  }
  return { ok: true, data: { ...res.data, phone } };
}

/** Motivo opcional de la baja (texto plano, máx. 500). */
export function parseDeleteForm(form: FormData): ParseResult<{ reason: string }> {
  const reason = get(form, "reason").trim();
  const values = { reason: reason.slice(0, 300) };
  if (get(form, "confirm") !== "on") {
    return { ok: false, errors: { confirm: "Marca la casilla para confirmar." }, values };
  }
  if (reason.length > 500) {
    return { ok: false, errors: { reason: "Máximo 500 caracteres." }, values };
  }
  return {
    ok: true,
    data: {
      // eslint-disable-next-line no-control-regex -- sin caracteres de control (salvo \n)
      reason: reason.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").trim(),
    },
  };
}

// ── Errores de Medusa ──────────────────────────────────────────────────────────────────────

/** ¿El registro falló porque ya existe una identidad con ese email? (Medusa 2.21.2, 401). */
export function isIdentityExists(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /identity with email already exists/i.test(message);
}

/** ¿Credenciales incorrectas o token no válido? (401 de Medusa). */
export function isUnauthorized(err: unknown): boolean {
  return (err as { status?: unknown } | null)?.status === 401;
}

// ── Direcciones guardadas ──────────────────────────────────────────────────────────────────

/**
 * Dirección de la libreta: los mismos campos y reglas que la de envío del checkout (Península +
 * Baleares, teléfono obligatorio para el transporte) y un nombre opcional ("Casa", "Trabajo").
 */
export const SAVED_ADDRESS_FIELDS = [
  "address_name",
  "first_name",
  "last_name",
  "address_1",
  "address_2",
  "postal_code",
  "city",
  "phone",
] as const;

export interface SavedAddress {
  address_name: string;
  first_name: string;
  last_name: string;
  address_1: string;
  address_2: string;
  postal_code: string;
  city: string;
  province: string;
  phone: string;
  country_code: "es";
  is_default_shipping: boolean;
}

export function parseSavedAddressForm(form: FormData): ParseResult<SavedAddress> {
  const values: Record<string, string> = {};
  for (const k of SAVED_ADDRESS_FIELDS) values[k] = get(form, k).slice(0, 300);
  values.is_default = get(form, "is_default") === "on" ? "on" : "";
  const errors: Record<string, string> = {};
  const res = z
    .object({
      first_name: text(80, "Escribe el nombre."),
      last_name: text(80, "Escribe los apellidos."),
      address_1: text(120, "Escribe la dirección."),
      city: text(80, "Escribe la población."),
    })
    .safeParse(values);
  if (!res.success) {
    for (const issue of res.error.issues) errors[String(issue.path[0])] ??= issue.message;
  }
  const name = (values.address_name ?? "").trim();
  const line2 = (values.address_2 ?? "").trim();
  if (name.length > 40) errors.address_name = "Máximo 40 caracteres.";
  if (line2.length > 120) errors.address_2 = "Máximo 120 caracteres.";
  const cp = (values.postal_code ?? "").trim();
  const check = checkShippingPostalCode(cp);
  if (!check.ok) errors.postal_code = check.error;
  const phone = normalizePhone(values.phone ?? "");
  if (!phone) errors.phone = "Escribe un teléfono válido (p. ej. 600 123 456).";
  if (!res.success || !check.ok || !phone || Object.keys(errors).length) {
    return { ok: false, errors, values };
  }
  return {
    ok: true,
    data: {
      ...res.data,
      address_name: name,
      address_2: line2,
      postal_code: cp,
      province: check.province,
      phone,
      country_code: "es",
      is_default_shipping: values.is_default === "on",
    },
  };
}

/** Dirección predeterminada de envío (o la primera), para rellenar el checkout. */
export function defaultAddress<T extends { is_default_shipping?: boolean | null }>(
  addresses: readonly T[] | null | undefined,
): T | null {
  const list = addresses ?? [];
  return list.find((a) => a.is_default_shipping) ?? list[0] ?? null;
}

// ── Pedidos ────────────────────────────────────────────────────────────────────────────────

interface OrderStatusLike {
  status?: string | null;
  fulfillment_status?: string | null;
}

/** Estado del pedido para el cliente (Medusa 2.21.2: `status` + `fulfillment_status`). */
export function orderStatusLabel(order: OrderStatusLike): string {
  if (order.status === "canceled") return "Cancelado";
  switch (order.fulfillment_status) {
    case "delivered":
      return "Entregado";
    case "shipped":
    case "partially_delivered":
      return "Enviado";
    case "partially_shipped":
      return "Enviado en parte";
    case "fulfilled":
    case "partially_fulfilled":
      return "Preparando el envío";
    default:
      return order.status === "completed" ? "Completado" : "Recibido";
  }
}

type AddressLike = {
  first_name?: string | null;
  last_name?: string | null;
  address_1?: string | null;
  address_2?: string | null;
  postal_code?: string | null;
  city?: string | null;
};

/** ¿Misma dirección? (para no guardar duplicados desde el checkout). Sin mayúsculas ni espacios. */
export function sameAddress(a: AddressLike, b: AddressLike): boolean {
  const norm = (v: string | null | undefined) =>
    (v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return (
    ["first_name", "last_name", "address_1", "address_2", "postal_code", "city"] as const
  ).every((k) => norm(a[k]) === norm(b[k]));
}
