// Orquestación de una página de resultados (servidor): búsqueda → precio/stock frescos de los
// ids de la página → facetas con recuentos → miniaturas del build. La usan /buscar/ y su
// fragmento /buscar/parcial/ (fase 7-1).
import { getCardImages } from "./card-images";
import type { StoreProduct } from "./catalog";
import { facetsFromSearch, type ListingFacets } from "./facets";
import type { CardImage } from "./images";
import { categoryNames, facetCategories, narrowCategories } from "./categories";
import { getPricedProductsByIds, searchProducts } from "./medusa";
import { getShopTree } from "./shop";
import { buildSearchQueries, parseSearchResults, type SearchParams } from "./search";
import type { Timings } from "./server-timing";

export interface SearchPage {
  products: StoreProduct[];
  total: number;
  facets: ListingFacets;
  /** handle → nombre de todo el árbol (chips de filtros). */
  categories: Map<string, string>;
  images: Map<string, CardImage> | undefined;
}

/** `timings` (opcional): mide cada llamada para la cabecera Server-Timing (lib/server-timing). */
export async function loadSearchPage(params: SearchParams, timings?: Timings): Promise<SearchPage> {
  const measure = <T>(name: string, work: Promise<T>) =>
    timings ? timings.measure(name, work) : work;
  const tree = await getShopTree(false); // en memoria (manifiesto del build): sin red
  const query = { ...params, categoria: narrowCategories(tree, params.categoria) };
  const results = await measure("search", searchProducts(buildSearchQueries(query)));
  const outcome = parseSearchResults(params, results);
  const products = await measure("cards", getPricedProductsByIds(outcome.ids));
  return {
    products,
    total: outcome.total,
    facets: facetsFromSearch(outcome.facets, {
      // Filtro por niveles (Fase S): raíces, o las hijas de lo elegido
      categories: facetCategories(tree, params.categoria),
      selected: new Set([...params.categoria, ...params.etiqueta, ...params.opcion]),
      total: outcome.total,
      disponible: params.disponible,
    }),
    categories: categoryNames(tree),
    images: getCardImages(),
  };
}
