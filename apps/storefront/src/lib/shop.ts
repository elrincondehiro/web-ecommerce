// Catálogo de la TIENDA (Fase S, S-1; sin descatalogados, Fase E), solo servidor: árbol de categorías sin las vacías y los
// listados (categorías con su subárbol, /productos/, /ofertas/, carrusel de la home) con sus
// claves de LiveSync (lib/listing-pages.ts, D-S1).
// - Build: se calcula del catálogo del build (memorizado) → páginas, menú, sitemap y los dos
//   manifiestos privados (src/pages/listados/*.json.ts → dist/server, astro.config.mjs).
// - Runtime (páginas on-demand, islands): se LEE de esos manifiestos (sin red, una vez por
//   proceso): el menú y los nombres de categoría coinciden con las páginas que existen. Sin
//   manifiesto: en `astro dev` se calcula; en producción, árbol completo de Medusa (sin podar).
import { getEntry } from "astro:content";
import { readBuildManifest } from "./build-manifest";
import type { StoreProduct } from "./catalog";
import {
  buildCategoryTree,
  productsInSubtree,
  pruneEmpty,
  type CategoryNode,
  type CategoryTree,
  type StoreCategory,
} from "./categories";
import { groupCorreas, isCorrea, tableProducts } from "./correa";
import { listingPagesManifest, LISTING_PAGES_MANIFEST } from "./listing-pages";
import {
  getCategoryList,
  getCollectionByHandle,
  getListedProducts,
  getSaleProducts,
} from "./medusa";

export const SHOP_CATEGORIES_MANIFEST = "shop-categories.json";

let buildTree: Promise<CategoryTree> | undefined;
let runtimeTree: Promise<CategoryTree> | undefined;

/** Árbol de la tienda: solo categorías con productos en su subárbol (build y `astro dev`). */
function computeShopTree(): Promise<CategoryTree> {
  return (buildTree ??= (async () => {
    const [list, products] = await Promise.all([getCategoryList(), getListedProducts()]);
    return pruneEmpty(buildCategoryTree(list), products);
  })());
}

/**
 * `prerendered`: true en build (páginas estáticas, endpoints del manifiesto), false en runtime
 * (`Astro.isPrerendered` en componentes; false en lib de runtime).
 */
export function getShopTree(prerendered: boolean): Promise<CategoryTree> {
  if (prerendered || import.meta.env.DEV) return computeShopTree();
  runtimeTree ??= (async () => {
    const saved = readBuildManifest<StoreCategory>(SHOP_CATEGORIES_MANIFEST);
    if (saved.size) return buildCategoryTree([...saved.values()]);
    return buildCategoryTree(await getCategoryList());
  })();
  runtimeTree.catch(() => (runtimeTree = undefined));
  return runtimeTree;
}

/** Lista plana del árbol podado (contenido de dist/server/shop-categories.json). */
export function shopCategoriesManifest(tree: CategoryTree): Record<string, StoreCategory> {
  return Object.fromEntries(
    tree.all.map((n) => [
      n.id,
      {
        id: n.id,
        handle: n.handle,
        name: n.name,
        description: n.description,
        rank: n.rank,
        parent_category_id: n.parentId,
      } as StoreCategory,
    ]),
  );
}

let listingPromise: Promise<StoreProduct[]> | undefined;

/**
 * Productos de las TARJETAS de los listados (categorías, /productos/, carrusel de la home): el
 * catálogo listado con las correas a medida en UNA tarjeta de grupo (E-2c, lib/correa.ts), en el
 * sitio de la primera. Las fichas, el sitemap y las miniaturas siguen usando `getListedProducts`.
 */
export function getListingProducts(): Promise<StoreProduct[]> {
  return (listingPromise ??= getListedProducts().then((p) => groupCorreas(p)));
}

/** Correas a medida del catálogo listado (página de grupo, E-2c). */
export async function getCorreaProducts(): Promise<StoreProduct[]> {
  return (await getListedProducts()).filter(isCorrea);
}

/** Productos de una categoría y de sus descendientes (orden del catálogo, sin duplicados). */
export async function getCategoryProducts(node: CategoryNode): Promise<StoreProduct[]> {
  return productsInSubtree(await getListingProducts(), node);
}

/** Productos del carrusel de la home: Collection de content/home.yaml, hasta `maximo`. */
export async function getFeaturedProducts(): Promise<StoreProduct[]> {
  const home = (await getEntry("home", "home"))!.data;
  const collection = await getCollectionByHandle(home.destacados.coleccion);
  if (!collection) return [];
  return (await getListingProducts())
    .filter((p) => p.collection_id === collection.id)
    .slice(0, home.destacados.maximo);
}

/** Manifiesto { clave → ids } de TODOS los listados del build (D-S1). */
export async function buildListingManifest(): Promise<Record<string, string[]>> {
  const [tree, products, sale, featured, correas] = await Promise.all([
    computeShopTree(),
    getListingProducts(),
    getSaleProducts(),
    getFeaturedProducts(),
    getCorreaProducts(),
  ]);
  const ids = (list: StoreProduct[]) => list.map((p) => p.id);
  return listingPagesManifest([
    { ids: ids(products) },
    { ids: ids(sale) },
    { ids: ids(featured), size: Infinity },
    // Landing de la correa a medida (E-2c): las correas de la tabla de precios (una por material)
    { ids: ids(tableProducts(correas)), size: Infinity },
    ...tree.all.map((n) => ({ ids: ids(productsInSubtree(products, n)) })),
  ]);
}

let devManifest: Promise<Record<string, string[]>> | undefined;

/** Ids del build para la clave de una página de listado (island de LiveSync). */
export async function listingIds(key: string): Promise<string[]> {
  if (import.meta.env.DEV) return (await (devManifest ??= buildListingManifest()))[key] ?? [];
  return readBuildManifest<string[]>(LISTING_PAGES_MANIFEST).get(key) ?? [];
}
