// Orquestación de una página de resultados (servidor): búsqueda → precio/stock frescos de los
// ids de la página → facetas con recuentos → miniaturas del build. La usan /buscar/ y su
// fragmento /buscar/parcial/ (fase 7-1).
import { getCardImages } from "./card-images";
import type { StoreProduct } from "./catalog";
import { facetsFromSearch, type ListingFacets } from "./facets";
import type { CardImage } from "./images";
import { getCategories, getPricedProductsByIds, searchProducts } from "./medusa";
import { buildSearchQueries, parseSearchResults, type SearchParams } from "./search";
import type { Timings } from "./server-timing";

export interface SearchPage {
  products: StoreProduct[];
  total: number;
  facets: ListingFacets;
  categories: Map<string, string>;
  images: Map<string, CardImage> | undefined;
}

/** `timings` (opcional): mide cada llamada para la cabecera Server-Timing (lib/server-timing). */
export async function loadSearchPage(params: SearchParams, timings?: Timings): Promise<SearchPage> {
  const measure = <T>(name: string, work: Promise<T>) =>
    timings ? timings.measure(name, work) : work;
  const [results, categoryList] = await Promise.all([
    measure("search", searchProducts(buildSearchQueries(params))),
    measure("categories", getCategories()),
  ]);
  const outcome = parseSearchResults(params, results);
  const categories = new Map(categoryList.map((c) => [c.handle, c.name]));
  const products = await measure("cards", getPricedProductsByIds(outcome.ids));
  return {
    products,
    total: outcome.total,
    facets: facetsFromSearch(outcome.facets, {
      categories,
      selected: new Set([...params.categoria, ...params.etiqueta, ...params.opcion]),
      total: outcome.total,
      disponible: params.disponible,
    }),
    categories,
    images: getCardImages(),
  };
}
