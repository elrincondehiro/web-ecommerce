// Orquestación de una página de resultados (servidor): búsqueda → precio/stock frescos de los
// ids de la página → facetas con recuentos → miniaturas del build. La usan /buscar/ y su
// fragmento /buscar/parcial/ (fase 7-1).
import { readBuildManifest } from "./build-manifest";
import { getCardImages } from "./card-images";
import type { StoreProduct } from "./catalog";
import { facetsFromSearch, type ListingFacets } from "./facets";
import type { CardImage } from "./images";
import { categoryIndent, categoryNames, facetCategories, narrowCategories } from "./categories";
import { CORREA_OPTION_TITLES, groupSearchIds } from "./correa";
import { cardOf, freshCorreaCards, getCorreaCards } from "./correa-server";
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

/** Opciones no filtrables (Fase O): manifiesto del build `hidden-options.json`. */
const hiddenOptions = () => readBuildManifest<number>("hidden-options.json");

/** `timings` (opcional): mide cada llamada para la cabecera Server-Timing (lib/server-timing). */
export async function loadSearchPage(params: SearchParams, timings?: Timings): Promise<SearchPage> {
  const measure = <T>(name: string, work: Promise<T>) =>
    timings ? timings.measure(name, work) : work;
  const tree = await getShopTree(false); // en memoria (manifiesto del build): sin red
  const query = { ...params, categoria: narrowCategories(tree, params.categoria) };
  const results = await measure("search", searchProducts(buildSearchQueries(query)));
  const outcome = parseSearchResults(params, results);
  // Correas a medida (E-2c): con ≥ 2 en la página, una tarjeta de grupo; sus datos, del
  // manifiesto del build + variantes del largo más corto (lib/correa-server.ts). El total y las
  // facetas siguen siendo los del motor (cuentan cada color): diferencia aceptada.
  const cards = await getCorreaCards();
  const ids = groupSearchIds(outcome.ids, cards);
  const [rest, correas] = await measure(
    "cards",
    Promise.all([
      getPricedProductsByIds(ids.filter((id) => !cardOf(cards, id))),
      freshCorreaCards(ids, cards),
    ]),
  );
  const byId = new Map(rest.map((p) => [p.id, p]));
  const products = ids.flatMap((id) => {
    const p = correas.get(id) ?? byId.get(id);
    return p ? [p] : [];
  });
  const facets = facetsFromSearch(
    {
      ...outcome.facets,
      // Las opciones de la correa (largo, mosquetones) se eligen en su ficha: no son filtros.
      // Tampoco las marcadas `filtrable = false` en el Admin (Fase O, manifiesto del build).
      opcion: outcome.facets.opcion.filter((f) => {
        const title = f.value.slice(0, f.value.indexOf(":"));
        return !CORREA_OPTION_TITLES.has(title) && !hiddenOptions().has(title);
      }),
    },
    {
      // Filtro por niveles (Fase S): raíces, o las hijas de lo elegido
      categories: facetCategories(tree, params.categoria),
      selected: new Set([...params.categoria, ...params.etiqueta, ...params.opcion]),
      total: outcome.total,
      disponible: params.disponible,
    },
  );
  // Sangría de las subcategorías (Fase F): las hijas de lo elegido, debajo de su padre
  const cat = facets.groups.find((g) => g.key === "categoria");
  if (cat) {
    const indent = categoryIndent(
      tree,
      cat.values.map((v) => v.value),
    );
    for (const v of cat.values) v.depth = indent.get(v.value) ?? 0;
  }
  return {
    products,
    total: outcome.total,
    facets,
    categories: categoryNames(tree),
    images: getCardImages(),
  };
}
