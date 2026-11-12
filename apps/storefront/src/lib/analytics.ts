// Analítica Umami (Fase MK-E): sin cookies, autoalojada. Ver docs/fases/faseMK-marketing.md §5.
// - `umamiClean`: filtro `data-before-send` (lo registra SiteClient como `window.umamiFiltro`).
//   De la URL solo quedan `q` (qué se busca) y `utm_*` (campañas): fuera tokens de enlaces de
//   email (verificar, restablecer, baja…), ids y el `#…`. Ids y tokens en la RUTA se enmascaran
//   (/pedido/:id/, /deseos/:token/…) y entonces el título también (lleva el nº o el nombre).
//   Referencia externa: solo el origen. Nunca `identify` ni importes.
// - `umamiEvent`: atributos `data-umami-event*` para un botón (Umami cuenta el clic; 0 JS
//   nuestro). Vacío si Umami no está configurado en el build.
// Fuente: docs.umami.is (tracker-configuration: data-before-send, data-domains,
// data-do-not-track, data-performance; track-events) vía context7 /websites/umami_is, y el
// código del tracker de v3.4.1 (src/tracker/index.ts).

/** Nombre global del filtro (`data-before-send`). */
export const UMAMI_FILTER = "umamiFiltro";

const KEEP = /^(q|utm_\w+)$/;
// Ids y tokens en la ruta → `:id` (también el título, que lleva el nº de pedido o el nombre).
const ID = /^\/(pedido|cuenta\/pedidos|cuenta\/mascotas(?!\/nueva\/)|deseos)\/[^/]+\//;

export type UmamiPayload = { url?: string; referrer?: string; title?: string } & Record<
  string,
  unknown
>;

function clean(raw: string, origin: string): [URL, boolean] {
  const u = new URL(raw, origin);
  const masked = ID.test(u.pathname);
  u.pathname = u.pathname.replace(ID, "/$1/:id/");
  for (const k of [...u.searchParams.keys()]) if (!KEEP.test(k)) u.searchParams.delete(k);
  u.hash = "";
  return [u, masked];
}

/**
 * Filtro de Umami: misma forma de payload, sin datos de más. `url` absoluta (como la manda el
 * tracker); `referrer` propio como ruta (el tracker ya le quita el origen) y externo, solo el origen.
 */
export function umamiClean(p: UmamiPayload, origin: string): UmamiPayload {
  const out = { ...p };
  if (p.url) {
    const [u, masked] = clean(p.url, origin);
    out.url = u.href;
    if (masked) out.title = u.pathname;
  }
  if (p.referrer) {
    const [u] = clean(p.referrer, origin);
    out.referrer = u.origin === origin ? u.pathname + u.search : u.origin;
  }
  return out;
}

/** Atributos de evento de Umami para un botón (vacío sin Umami en el build). */
export function umamiEvent(
  name: string,
  data: Record<string, string> = {},
): Record<string, string> {
  if (!import.meta.env.UMAMI) return {};
  const attrs: Record<string, string> = { "data-umami-event": name };
  for (const [k, v] of Object.entries(data)) attrs[`data-umami-event-${k}`] = v;
  return attrs;
}
