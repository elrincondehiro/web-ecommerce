// Sugerencias (fase 7-2), servidor: una consulta a POST /store/search + nombres de categorías,
// con caché en memoria por texto normalizado (SEARCH_SUGGEST_CACHE_TTL, 500 entradas).
import { SEARCH_SUGGEST_CACHE_TTL } from "astro:env/server";
import { CardCache } from "./card-cache";
import { categoryNames } from "./categories";
import { searchProducts } from "./medusa";
import { getShopTree } from "./shop";
import { buildSuggestQuery, parseSuggestions, type Suggestions } from "./suggest";

const cache =
  SEARCH_SUGGEST_CACHE_TTL > 0
    ? new CardCache<Suggestions>({ ttlMs: SEARCH_SUGGEST_CACHE_TTL * 1000, maxEntries: 500 })
    : undefined;

/** `q` ya normalizado (normalizeSuggestQuery). Lanza si el backend falla. */
export async function getSuggestions(q: string): Promise<Suggestions> {
  const hit = cache?.get(q);
  if (hit) return hit;
  const [[result], tree] = await Promise.all([
    searchProducts([buildSuggestQuery(q)]),
    getShopTree(false),
  ]);
  const s = parseSuggestions(q, result, categoryNames(tree));
  cache?.set(q, s);
  return s;
}
