// Checkout (fase 5): funciones PURAS (sin astro:* ni I/O) para poder testearlas con Vitest.
// La I/O contra Medusa está en lib/medusa.ts y la orquestación en src/actions/checkout.ts,
// src/pages/checkout/*. Decisiones (docs/fases/fase5.md §2.9): solo Península + Baleares,
// teléfono obligatorio, una página con pasos y POST/Redirect/GET sin JS.
import { z } from "astro/zod";

export const CHECKOUT_PATH = "/checkout/";
export const COMPLETE_PATH = "/checkout/completar/";
export const STRIPE_PROVIDER_ID = "pp_stripe_stripe";

export type CheckoutActionName = "checkout.address" | "checkout.shipping" | "checkout.payment";

/** URL de un formulario sin JS: `?_action=<nombre>` (ACTION_QUERY_PARAMS de Astro). */
export function checkoutActionUrl(name: CheckoutActionName): string {
  return `${CHECKOUT_PATH}?_action=${name}`;
}

export function orderPath(orderId: string): string {
  return `/pedido/${orderId}/`;
}

// ── Cookies ────────────────────────────────────────────────────────────────────────────────

/** Último pedido del navegador: permite ver los datos de /pedido/<id>/ durante 1 h (P7). */
export const LAST_ORDER_COOKIE = "last_order";
export function lastOrderCookieOptions(secure: boolean) {
  return { httpOnly: true, secure, sameSite: "lax" as const, path: "/pedido/", maxAge: 60 * 60 };
}

/** ¿Puede este navegador ver los datos del pedido? Solo si es su último pedido. */
export function canViewOrder(cookieValue: string | undefined, orderId: string): boolean {
  return typeof cookieValue === "string" && cookieValue.length > 0 && cookieValue === orderId;
}

/**
 * Aviso + errores + valores del formulario tras un POST sin JS (PRG). Cookie httpOnly de 1 min,
 * solo para /checkout/, que la página lee y borra (sin `session` de Astro, fase 4).
 */
export const FLASH_COOKIE = "checkout_flash";
export function flashCookieOptions(secure: boolean) {
  return { httpOnly: true, secure, sameSite: "lax" as const, path: CHECKOUT_PATH, maxAge: 60 };
}

export const CHECKOUT_NOTICES = {
  invalid: "Revisa los campos marcados.",
  shipping: "Elige un método de envío válido.",
  stock: "Algún producto ya no tiene stock suficiente. Revisa tu carrito.",
  payment_failed: "El pago no se ha completado. Prueba de nuevo o usa otro método de pago.",
  payment_pending: "El pago aún no está confirmado. Completa el pago para realizar el pedido.",
  error: "Ha ocurrido un error. Inténtalo de nuevo.",
} as const;
export type CheckoutNoticeCode = keyof typeof CHECKOUT_NOTICES;

export interface Flash {
  code?: CheckoutNoticeCode;
  errors?: Record<string, string>;
  values?: Record<string, string>;
}

const MAX_FLASH = 3000;

export function encodeFlash(flash: Flash): string {
  return JSON.stringify(flash);
}

/** Lee la cookie flash; ante cualquier dato inesperado devuelve `{}` (nunca lanza). */
export function decodeFlash(raw: string | undefined): Flash {
  if (!raw || raw.length > MAX_FLASH) return {};
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object") return {};
    const { code, errors, values } = data as Record<string, unknown>;
    const out: Flash = {};
    if (typeof code === "string" && code in CHECKOUT_NOTICES) out.code = code as CheckoutNoticeCode;
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

// ── Dirección (solo España peninsular + Baleares, P2) ──────────────────────────────────────

/**
 * Provincia por los 2 primeros dígitos del CP (= código INE de provincia). Excluidas Las Palmas
 * (35), Santa Cruz de Tenerife (38), Ceuta (51) y Melilla (52): sin IVA (IGIC/IPSI).
 */
export const PROVINCES: Readonly<Record<string, string>> = {
  "01": "Araba/Álava",
  "02": "Albacete",
  "03": "Alicante",
  "04": "Almería",
  "05": "Ávila",
  "06": "Badajoz",
  "07": "Illes Balears",
  "08": "Barcelona",
  "09": "Burgos",
  "10": "Cáceres",
  "11": "Cádiz",
  "12": "Castellón",
  "13": "Ciudad Real",
  "14": "Córdoba",
  "15": "A Coruña",
  "16": "Cuenca",
  "17": "Girona",
  "18": "Granada",
  "19": "Guadalajara",
  "20": "Gipuzkoa",
  "21": "Huelva",
  "22": "Huesca",
  "23": "Jaén",
  "24": "León",
  "25": "Lleida",
  "26": "La Rioja",
  "27": "Lugo",
  "28": "Madrid",
  "29": "Málaga",
  "30": "Murcia",
  "31": "Navarra",
  "32": "Ourense",
  "33": "Asturias",
  "34": "Palencia",
  "36": "Pontevedra",
  "37": "Salamanca",
  "39": "Cantabria",
  "40": "Segovia",
  "41": "Sevilla",
  "42": "Soria",
  "43": "Tarragona",
  "44": "Teruel",
  "45": "Toledo",
  "46": "Valencia",
  "47": "Valladolid",
  "48": "Bizkaia",
  "49": "Zamora",
  "50": "Zaragoza",
};
/** Provincias sin envío (Canarias, Ceuta, Melilla): válidas solo en la dirección de facturación. */
export const BILLING_ONLY_PROVINCES: Readonly<Record<string, string>> = {
  "35": "Las Palmas",
  "38": "Santa Cruz de Tenerife",
  "51": "Ceuta",
  "52": "Melilla",
};
/** CP de España sin envío (Canarias, Ceuta, Melilla). */
export const NO_SHIPPING_PREFIXES = ["35", "38", "51", "52"] as const;

/** `pattern` HTML del CP de envío: 5 dígitos con prefijo 01–50 salvo 35 y 38. */
export const SHIPPING_CP_PATTERN = "(0[1-9]|[1-2][0-9]|3[0-4]|3[679]|4[0-9]|50)[0-9]{3}";

export type PostalCheck = { ok: true; province: string } | { ok: false; error: string };

export function checkShippingPostalCode(cp: string): PostalCheck {
  if (!/^\d{5}$/.test(cp)) return { ok: false, error: "El código postal tiene 5 dígitos." };
  const prefix = cp.slice(0, 2);
  if ((NO_SHIPPING_PREFIXES as readonly string[]).includes(prefix)) {
    return {
      ok: false,
      error:
        "De momento solo enviamos a la Península y Baleares (no a Canarias, Ceuta ni Melilla).",
    };
  }
  const province = PROVINCES[prefix];
  return province ? { ok: true, province } : { ok: false, error: "Código postal no válido." };
}

/** Teléfono: español (9 dígitos 6/7/8/9, con +34/0034 opcional) o internacional (+ 8–15). */
export function normalizePhone(raw: string): string | null {
  const v = raw.replace(/[\s\-.()]/g, "");
  const es = /^(?:\+34|0034)?([6789]\d{8})$/.exec(v);
  if (es) return `+34${es[1]}`;
  if (/^\+[1-9]\d{7,14}$/.test(v)) return v;
  return null;
}

const text = (max: number, msg: string) =>
  z
    .string()
    .trim()
    .min(1, msg)
    .max(max, `Máximo ${max} caracteres.`)
    // eslint-disable-next-line no-control-regex -- se rechazan caracteres de control a propósito
    .refine((s) => !/[\u0000-\u001f\u007f]/.test(s), "Caracteres no válidos.");

const optionalText = (max: number) =>
  z.string().trim().max(max, `Máximo ${max} caracteres.`).optional().default("");

/** Campos de una dirección en el formulario (prefijo vacío = envío, `billing_` = facturación). */
export const ADDRESS_FIELDS = [
  "first_name",
  "last_name",
  "address_1",
  "address_2",
  "postal_code",
  "city",
] as const;

const addressShape = {
  first_name: text(80, "Escribe tu nombre."),
  last_name: text(80, "Escribe tus apellidos."),
  address_1: text(120, "Escribe la dirección."),
  address_2: optionalText(120),
  postal_code: z.string().trim(),
  city: text(80, "Escribe la población."),
};

export interface CheckoutAddress {
  first_name: string;
  last_name: string;
  address_1: string;
  address_2: string;
  postal_code: string;
  city: string;
  province: string;
  phone: string;
  country_code: "es";
}

export interface AddressFormData {
  email: string;
  shipping: CheckoutAddress;
  billing: CheckoutAddress;
}

export type AddressParseResult =
  | { ok: true; data: AddressFormData }
  | { ok: false; errors: Record<string, string>; values: Record<string, string> };

/** Campos del formulario que se devuelven (rellenados) tras un error. */
export const ADDRESS_FORM_FIELDS = [
  "email",
  "phone",
  ...ADDRESS_FIELDS,
  "same_billing",
  ...ADDRESS_FIELDS.map((f) => `billing_${f}`),
  // Cliente con sesión (fase 9): guardar la dirección de envío en la cuenta.
  "save_address",
] as const;

/**
 * Valida el formulario de datos y dirección (FormData → objeto). Devuelve errores por campo
 * con mensajes en español y los valores introducidos para volver a pintar el formulario.
 */
export function parseAddressForm(form: FormData): AddressParseResult {
  const get = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : "";
  };
  const values: Record<string, string> = {};
  for (const k of ADDRESS_FORM_FIELDS) values[k] = get(k).slice(0, 300);
  const errors: Record<string, string> = {};

  const email = z
    .email("Escribe un email válido.")
    .max(254)
    .safeParse(values.email?.trim().toLowerCase());
  if (!email.success) errors.email = "Escribe un email válido.";

  const phone = normalizePhone(values.phone ?? "");
  if (!phone) errors.phone = "Escribe un teléfono válido (p. ej. 600 123 456).";

  const parseAddress = (prefix: "" | "billing_", shipping: boolean): CheckoutAddress | null => {
    const raw = Object.fromEntries(ADDRESS_FIELDS.map((f) => [f, values[`${prefix}${f}`] ?? ""]));
    const res = z.object(addressShape).safeParse(raw);
    if (!res.success) {
      for (const issue of res.error.issues) {
        const key = `${prefix}${String(issue.path[0])}`;
        errors[key] ??= issue.message;
      }
    }
    const cp = (raw.postal_code ?? "").trim();
    let province = "";
    if (shipping) {
      const check = checkShippingPostalCode(cp);
      if (check.ok) province = check.province;
      else errors[`${prefix}postal_code`] = check.error;
    } else {
      // Facturación: cualquier CP de España (01–52).
      const prefix2 = /^\d{5}$/.test(cp) ? cp.slice(0, 2) : "";
      province = PROVINCES[prefix2] ?? BILLING_ONLY_PROVINCES[prefix2] ?? "";
      if (!province) errors[`${prefix}postal_code`] = "Código postal no válido.";
    }
    if (!res.success || !province) return null;
    return { ...res.data, postal_code: cp, province, phone: phone ?? "", country_code: "es" };
  };

  const shipping = parseAddress("", true);
  const sameBilling = values.same_billing === "on";
  const billing = sameBilling ? shipping : parseAddress("billing_", false);

  if (Object.keys(errors).length || !email.success || !shipping || !billing || !phone) {
    return { ok: false, errors, values };
  }
  return { ok: true, data: { email: email.data, shipping, billing } };
}

// ── Estado del checkout a partir del carrito ───────────────────────────────────────────────

export interface CheckoutCartLike {
  email?: string | null;
  total?: number | null;
  items?: unknown[] | null;
  shipping_address?: { postal_code?: string | null; address_1?: string | null } | null;
  shipping_methods?: { shipping_option_id?: string | null }[] | null;
  payment_collection?: {
    payment_sessions?:
      | {
          provider_id?: string | null;
          status?: string | null;
          amount?: number | null;
          data?: Record<string, unknown> | null;
        }[]
      | null;
  } | null;
}

export function addressDone(cart: CheckoutCartLike): boolean {
  const cp = cart.shipping_address?.postal_code ?? "";
  return Boolean(cart.email && cart.shipping_address?.address_1 && checkShippingPostalCode(cp).ok);
}

export function shippingDone(cart: CheckoutCartLike): boolean {
  return (cart.shipping_methods ?? []).some((m) => Boolean(m.shipping_option_id));
}

export type StripeSessionState =
  { state: "none" } | { state: "pending"; clientSecret: string } | { state: "authorized" };

/**
 * Sesión de Stripe utilizable. Medusa borra las sesiones cuando cambia el total del carrito
 * (refreshPaymentCollectionForCartWorkflow); por si acaso, también se exige el mismo importe.
 */
export function stripeSession(cart: CheckoutCartLike): StripeSessionState {
  const sessions = (cart.payment_collection?.payment_sessions ?? []).filter(
    (s) => s.provider_id === STRIPE_PROVIDER_ID,
  );
  if (sessions.some((s) => s.status === "authorized")) return { state: "authorized" };
  const pending = sessions.find(
    (s) =>
      s.status === "pending" &&
      s.amount === cart.total &&
      typeof s.data?.client_secret === "string",
  );
  return pending
    ? { state: "pending", clientSecret: pending.data?.client_secret as string }
    : { state: "none" };
}

// ── Errores de Medusa al completar ─────────────────────────────────────────────────────────

/**
 * Clasifica el error de `cart.complete` (FetchError del js-sdk o `error.message` de la respuesta
 * `type: "cart"`). Mensajes verificados contra Medusa 2.21.2:
 *   400 "Session: … was not authorized with the provider."  → payment_pending
 *   400 "Some variant does not have the required inventory"  → stock
 *   404 "Cart … not found"                                  → expired
 */
export function classifyCompleteError(err: unknown): CheckoutNoticeCode | "expired" {
  const status = (err as { status?: unknown } | null)?.status;
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : String(err ?? "");
  if (/not authorized with the provider|requires_more|authoriz/i.test(message))
    return "payment_pending";
  if (/required inventory|insufficient_inventory/i.test(message)) return "stock";
  if (status === 404 || /^cart (with id|id not found)/i.test(message)) return "expired";
  return "error";
}

/** `redirect_status` que añade Stripe al volver de un método con redirección/3DS. */
export function stripeRedirectFailed(redirectStatus: string | null): boolean {
  return redirectStatus === "failed";
}
