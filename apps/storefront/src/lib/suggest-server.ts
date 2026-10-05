// Sugerencias (fase 7-2), servidor: una consulta a POST /store/search + nombres de categorías,
// con caché en memoria por texto normalizado (SEARCH_SUGGEST_CACHE_TTL, 500 entradas).
import { SEARCH_SUGGEST_CACHE_TTL } from "astro:env/server";
import { CardCache } from "./card-cache";
import { getCategories, searchProducts } from "./medusa";
import { buildSuggestQuery, parseSuggestions, type Suggestions } from "./suggest";

const cache =
  SEARCH_SUGGEST_CACHE_TTL > 0
    ? new CardCache<Suggestions>({ ttlMs: SEARCH_SUGGEST_CACHE_TTL * 1000, maxEntries: 500 })
    : undefined;

/** `q` ya normalizado (normalizeSuggestQuery). Lanza si el backend falla. */
export async function getSuggestions(q: string): Promise<Suggestions> {
  const hit = cache?.get(q);
  if (hit) return hit;
  const [[result], categories] = await Promise.all([
    searchProducts([buildSuggestQuery(q)]),
    getCategories(),
  ]);
  const s = parseSuggestions(q, result, new Map(categories.map((c) => [c.handle, c.name])));
  cache?.set(q, s);
  return s;
}
