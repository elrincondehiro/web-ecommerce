/**
 * Búsquedas de la tienda (Fase MK-E2): qué se busca y qué no encuentra. Contadores por término
 * normalizado y semana ISO, sin IP, sin cliente y sin hora: nada personal. Se registra solo la
 * búsqueda «limpia» de /buscar/ (texto, página 1, sin filtros ni orden): el storefront manda la
 * cabecera `x-search-log: 1` y el middleware de `/store/search` emite el evento con el total.
 * Se borra a las `SEARCH_LOG_WEEKS` semanas (52).
 * Detalle: docs/fases/faseMK-marketing.md §4c.
 */

export const SEARCH_LOGGED = "search.logged";
export type SearchLoggedData = { term: string; total: number };

export const SEARCH_LOG_HEADER = "x-search-log";
export const SEARCH_LOG_WEEKS = 52;
export const SEARCH_LOG_PURGE_DEFAULT_CRON = "45 4 * * *";
/** Periodos del Admin (días). */
export const SEARCH_LOG_PERIODS = [7, 30, 90, 365] as const;

/**
 * Término normalizado, o null si no se guarda: minúsculas, sin acentos (la ñ se queda), sin
 * signos y espacios juntos; 2–60 caracteres; nunca algo que parezca un email (`@`) o un número
 * largo (6+ cifras seguidas: teléfono, DNI, nº de pedido o de tarjeta).
 */
export function normalizeSearchTerm(raw: string): string | null {
  if (raw.includes("@") || /\d{6,}/.test(raw.replace(/[\s.\-/]/g, ""))) return null;
  // Sin acentos, pero la ñ es su propia letra: NFD la partiría en n + ~ (se vuelve a juntar).
  const term = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/n\u0303/g, "ñ")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return term.length >= 2 && term.length <= 60 ? term : null;
}

/** Lunes (UTC) de la semana de `d`: la «semana» de los contadores. */
export function weekStart(d: Date): string {
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}

/** Fila del Admin y del CSV. */
export type SearchTermRow = {
  term: string;
  /** Veces que se buscó en el periodo. */
  count: number;
  /** De ellas, sin ningún resultado. */
  zero: number;
  /** Resultados la última vez. */
  last_total: number;
  /** Última semana en la que se buscó (lunes, AAAA-MM-DD). */
  last_week: string;
};

/** CSV (separador `;` y BOM: Excel en español lo abre bien). */
export function searchTermsCsv(rows: SearchTermRow[]): string {
  const cell = (v: string | number) => {
    const s = String(v);
    // Comillas siempre en el texto; fuera fórmulas (=, +, -, @ al principio) por si se abre en Excel.
    return typeof v === "number"
      ? s
      : `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
  };
  const head = "termino;busquedas;sin_resultados;resultados_ultima_vez;ultima_semana";
  const body = rows.map((r) =>
    [cell(r.term), r.count, r.zero, r.last_total, cell(r.last_week)].join(";"),
  );
  return `\uFEFF${[head, ...body].join("\r\n")}\r\n`;
}
