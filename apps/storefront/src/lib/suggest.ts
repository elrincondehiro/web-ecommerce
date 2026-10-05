// Sugerencias de búsqueda (fase 7-2): funciones PURAS para el endpoint /buscar/sugerencias/.
// Una sola consulta a POST /store/search: 6 productos (id, título, handle; sin precio ni
// stock → no hay nada que "congelar", AGENTS §3.2) + la faceta de categorías de esa misma
// búsqueda para sugerir hasta 2 (medido: sin coste apreciable, fase7.md §2.7).
// Meilisearch busca por PREFIJO la última palabra ("bufan" → "bufanda") y tolera erratas desde
// 5 letras ("jersei" → "jersey"; con menos, solo prefijo: es la configuración por defecto).
import type { RawSearchResult, SearchQueryBody } from "./search";
import { SEARCH_PATH } from "./search";

export const SUGGEST_PATH = "/buscar/sugerencias/";
export const SUGGEST_MIN = 2;
export const SUGGEST_MAX = 50;
const PRODUCTS = 6;
const CATEGORIES = 2;

// eslint-disable-next-line no-control-regex -- se quitan caracteres de control a propósito
const CONTROL = /[\u0000-\u001f\u007f]/g;

/**
 * Texto normalizado (minúsculas, espacios simples, ≤ 50 caracteres): una sola URL y una sola
 * entrada de caché por búsqueda. `null` si es demasiado corto. El cliente aplica lo mismo.
 */
export function normalizeSuggestQuery(raw: string | null): string | null {
  const q = (raw ?? "").replace(CONTROL, "").replace(/\s+/g, " ").trim().toLowerCase();
  const cut = q.slice(0, SUGGEST_MAX).trim();
  return cut.length >= SUGGEST_MIN ? cut : null;
}

export function buildSuggestQuery(q: string): SearchQueryBody {
  return {
    entity: "product",
    fields: ["id", "title", "handle"],
    filters: { q },
    pagination: { skip: 0, take: PRODUCTS },
    search_options: { facets: ["category_handles"] },
  };
}

export interface Suggestions {
  q: string;
  products: { title: string; href: string }[];
  categories: { name: string; href: string }[];
  /** "Ver todos los resultados" */
  all: string;
}

type SuggestHit = { id: string; document?: { title?: unknown; handle?: unknown } };

/** Respuesta de Medusa → enlaces. `names`: handle → nombre (categorías de la tienda). */
export function parseSuggestions(
  q: string,
  result: RawSearchResult | undefined,
  names: Map<string, string>,
): Suggestions {
  const products = ((result?.hits ?? []) as SuggestHit[]).flatMap((h) => {
    const { title, handle } = h.document ?? {};
    return typeof title === "string" && typeof handle === "string" && title && handle
      ? [{ title, href: `/producto/${encodeURIComponent(handle)}/` }]
      : [];
  });
  const qs = (extra: Record<string, string> = {}) =>
    `${SEARCH_PATH}?${new URLSearchParams({ q, ...extra })}`;
  const categories = (result?.facets?.category_handles?.values ?? [])
    .filter((f) => f.count > 0 && names.has(f.value))
    .sort((a, b) => b.count - a.count)
    .slice(0, CATEGORIES)
    .map((f) => ({ name: names.get(f.value)!, href: qs({ categoria: f.value }) }));
  return { q, products, categories, all: qs() };
}
