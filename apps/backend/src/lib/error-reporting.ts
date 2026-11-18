/**
 * Errores de la aplicación a Bugsink (fase 12-B, docs/fases/fase12.md), con el SDK de Sentry
 * (`@sentry/node`). Funciones PURAS (opciones y filtro), probadas con Jest; las usa
 * `instrumentation.ts` (backend) e `instrument.mjs` (storefront). IDÉNTICO en apps/backend y
 * apps/storefront (un test lo comprueba).
 *
 * Sin `SENTRY_DSN` no se inicializa nada (local, CI, tests). Nunca datos personales (AGENTS §7.1):
 * `dataCollection` desactiva lo que el SDK recoge por defecto (usuario, cookies, cabeceras, cuerpos,
 * parámetros de la URL, datos de consultas SQL y variables locales) y `beforeSend` enmascara emails
 * y tokens que se cuelen en mensajes, URL o migas. Solo errores: sin trazas (Bugsink no las usa).
 * Fuente: context7 /getsentry/sentry-javascript (`dataCollection`, sustituto de
 * `sendDefaultPii`) y los tipos de @sentry/core 11.13.0 (`DataCollection`, defaults).
 */

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
// Tokens: JWT, claves de Stripe/Medusa y cadenas largas aleatorias (≥ 24 caracteres sin espacios).
const JWT = /\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g;
const KEY = /\b(?:sk|pk|rk|whsec|pk_live|sk_live|sk_test|pk_test)_[\w]{8,}\b/g;
// Los ids de Medusa (`order_01…`, `cus_01…`: prefijo + ULID) se dejan: no son datos personales y
// sirven para encontrar el pedido o el cliente.
const LONG = /\b(?![a-z]+(?:_[a-z]+)*_[0-9A-Z]{26}\b)[A-Za-z0-9_-]{32,}\b/g;
// «token=…», «password: …»: en una URL (?/&) o en un texto; `t` y `code` solo en URL (enlaces
// de baja y de verificación).
const SECRET_PARAM =
  /((?:[?&](?:t|code)|\b(?:token|email|key|secret|password|contraseña))\s*[=:]\s*)[^&#\s,;]+/gi;

/** Texto sin emails ni tokens. */
export function scrubText(value: string): string {
  return value
    .replace(SECRET_PARAM, "$1[filtrado]")
    .replace(JWT, "[token]")
    .replace(KEY, "[clave]")
    .replace(EMAIL, "[email]")
    .replace(LONG, "[token]");
}

type Json = unknown;

/** Recorre un valor (objeto, lista o texto) y enmascara los textos. Profundidad limitada. */
export function scrubDeep(value: Json, depth = 0): Json {
  if (typeof value === "string") return scrubText(value);
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, depth + 1));
  const out: Record<string, Json> = {};
  for (const [k, v] of Object.entries(value as Record<string, Json>)) {
    out[k] = /^(authorization|cookie|set-cookie|x-publishable-api-key|password|token)$/i.test(k)
      ? "[filtrado]"
      : scrubDeep(v, depth + 1);
  }
  return out;
}

type EventLike = {
  message?: string;
  user?: unknown;
  request?: {
    url?: string;
    query_string?: unknown;
    cookies?: unknown;
    data?: unknown;
    headers?: unknown;
  };
  exception?: { values?: { value?: string }[] };
  breadcrumbs?: { message?: string; data?: unknown }[];
  extra?: unknown;
  contexts?: unknown;
};

/** `beforeSend`: sin usuario, cookies ni cuerpos; mensajes, URL y migas enmascarados. */
export function scrubEvent<E extends EventLike>(event: E): E {
  delete event.user;
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.query_string;
    if (event.request.headers) event.request.headers = scrubDeep(event.request.headers);
    if (event.request.url) event.request.url = scrubText(event.request.url);
  }
  if (event.message) event.message = scrubText(event.message);
  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = scrubText(ex.value);
  }
  for (const b of event.breadcrumbs ?? []) {
    if (b.message) b.message = scrubText(b.message);
    if (b.data) b.data = scrubDeep(b.data);
  }
  if (event.extra) event.extra = scrubDeep(event.extra);
  if (event.contexts) event.contexts = scrubDeep(event.contexts);
  return event;
}

/** Lo que el SDK NO debe recoger (por defecto lo recoge todo). */
export const DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: false, response: false },
  httpBodies: [] as never[],
  urlQueryParams: false,
  databaseQueryData: false,
  stackFrameVariables: false,
  queues: false,
};

/**
 * Opciones de `Sentry.init`, o null si no hay DSN. `service`: «backend-server», «backend-worker» o
 * «storefront» (etiqueta para filtrar en Bugsink).
 */
export function errorReportingOptions(
  env: Record<string, string | undefined>,
  service: string,
): Record<string, unknown> | null {
  const dsn = env.SENTRY_DSN?.trim();
  if (!dsn) return null;
  return {
    dsn,
    environment: env.SENTRY_ENVIRONMENT || "production",
    release: env.SENTRY_RELEASE || undefined,
    serverName: service,
    initialScope: { tags: { service } },
    tracesSampleRate: 0,
    dataCollection: DATA_COLLECTION,
    beforeSend: scrubEvent,
    beforeBreadcrumb: (b: { message?: string; data?: unknown }) => {
      if (b.message) b.message = scrubText(b.message);
      if (b.data) b.data = scrubDeep(b.data);
      return b;
    },
  };
}
