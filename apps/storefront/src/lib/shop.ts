// Catálogo de la TIENDA (Fase S, S-1; sin descatalogados, Fase E), solo servidor: árbol de categorías sin las vacías y los
// listados (categorías con su subárbol, /productos/, /ofertas/, colecciones, carrusel de la home) con sus
// claves de LiveSync (lib/listing-pages.ts, D-S1).
// - Build: se calcula del catálogo del build (memorizado) → páginas, menú, sitemap y los dos
//   manifiestos privados (src/pages/listados/*.json.ts → dist/server, astro.config.mjs).
// - Runtime (páginas on-demand, islands): se LEE de esos manifiestos (sin red, una vez por
//   proceso): el menú y los nombres de categoría coinciden con las páginas que existen. Sin
//   manifiesto: en `astro dev` se calcula; en producción, árbol completo de Medusa (sin podar).
import { getEntry } from "astro:content";
import { readBuildManifest } from "./build-manifest";
import { isDiscontinued, type StoreProduct } from "./catalog";
import {
  buildCategoryTree,
  deepestCategory,
  productsInSubtree,
  pruneEmpty,
  type CategoryNode,
  type CategoryTree,
  type StoreCategory,
} from "./categories";
import { groupCorreas, isCorrea, tableProducts } from "./correa";
import { listingPagesManifest, LISTING_PAGES_MANIFEST } from "./listing-pages";
import { productRelated } from "./related";
import { newProducts } from "./home";
import {
  getAllProducts,
  getCategoryList,
  getCollectionByHandle,
  getCollections,
  getListedProducts,
  getSaleProducts,
  type StoreCollection,
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
        metadata: n.metadata,
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

export interface ShopCollection {
  collection: StoreCollection;
  /** Productos de las tarjetas (orden del catálogo; correas agrupadas). */
  products: StoreProduct[];
}

let collectionsPromise: Promise<ShopCollection[]> | undefined;

/**
 * Colecciones con productos (Fase H): una página /coleccion/<handle>/ por cada una. Las vacías
 * no tienen página (como las categorías vacías). Orden: título.
 */
export function getShopCollections(): Promise<ShopCollection[]> {
  return (collectionsPromise ??= (async () => {
    const [collections, products] = await Promise.all([getCollections(), getListingProducts()]);
    return collections
      .filter((c) => c.handle)
      .map((collection) => ({
        collection,
        products: products.filter((p) => p.collection_id === collection.id),
      }))
      .filter((c) => c.products.length > 0)
      .sort((a, b) => (a.collection.title ?? "").localeCompare(b.collection.title ?? "", "es"));
  })());
}

export const collectionHref = (handle: string) => `/coleccion/${handle}/`;

export interface FeaturedBlock {
  products: StoreProduct[];
  /** Total de la colección (para «Ver los N»). */
  total: number;
  href: string;
}

/**
 * Carrusel de la home: Collection de content/home.yaml (bloque `destacados`), hasta `maximo`.
 * Null si el bloque no está en el yaml o la colección no tiene productos (Fase H: no se pinta).
 */
export async function getFeaturedBlock(): Promise<FeaturedBlock | null> {
  const destacados = (await getEntry("home", "home"))!.data.destacados;
  if (!destacados) return null;
  const collection = await getCollectionByHandle(destacados.coleccion);
  if (!collection?.handle) return null;
  const all = (await getListingProducts()).filter((p) => p.collection_id === collection.id);
  if (!all.length) return null;
  return {
    products: all.slice(0, destacados.maximo),
    total: all.length,
    href: collectionHref(collection.handle),
  };
}

/** Fecha del build: la misma para la home y para el manifiesto de LiveSync. */
const BUILD_NOW = new Date();

export interface NewBlock {
  products: StoreProduct[];
  total: number;
}

/**
 * Novedades de la home (Fase H, c): bloque `novedades` de home.yaml, hasta `maximo`, de la más
 * reciente a la más antigua. Null si el bloque no está o no hay ninguna.
 */
export async function getNewBlock(): Promise<NewBlock | null> {
  const novedades = (await getEntry("home", "home"))!.data.novedades;
  if (!novedades) return null;
  const all = newProducts(await getListingProducts(), novedades, BUILD_NOW);
  return all.length ? { products: all.slice(0, novedades.maximo), total: all.length } : null;
}

let relatedPromise: Promise<Map<string, StoreProduct[]>> | undefined;

/**
 * Relacionados de cada ficha (Fase R, lib/related.ts), por id de producto. Una vez por build: el
 * catálogo ya está en memoria. Relleno: la categoría más concreta del producto (en el orden de
 * los listados, sin descatalogados).
 */
export function getRelatedByProduct(): Promise<Map<string, StoreProduct[]>> {
  return (relatedPromise ??= (async () => {
    const [all, tree] = await Promise.all([getAllProducts(), computeShopTree()]);
    const listed = all.filter((p) => !isDiscontinued(p));
    const byHandle = new Map(listed.map((p) => [p.handle, p]));
    const byCategory = new Map<string, StoreProduct[]>();
    const out = new Map<string, StoreProduct[]>();
    for (const product of all) {
      const node = deepestCategory(tree, product);
      let same: StoreProduct[] = [];
      if (node) {
        same = byCategory.get(node.id) ?? productsInSubtree(listed, node);
        byCategory.set(node.id, same);
      }
      out.set(product.id, productRelated(product, byHandle, same));
    }
    return out;
  })());
}

/** Manifiesto { clave → ids } de TODOS los listados del build (D-S1). */
export async function buildListingManifest(): Promise<Record<string, string[]>> {
  const [tree, products, sale, featured, fresh, correas, related, collections] = await Promise.all([
    computeShopTree(),
    getListingProducts(),
    getSaleProducts(),
    getFeaturedBlock(),
    getNewBlock(),
    getCorreaProducts(),
    getRelatedByProduct(),
    getShopCollections(),
  ]);
  const ids = (list: StoreProduct[]) => list.map((p) => p.id);
  return listingPagesManifest([
    { ids: ids(products) },
    { ids: ids(sale) },
    { ids: ids(featured?.products ?? []), size: Infinity },
    { ids: ids(fresh?.products ?? []), size: Infinity },
    // Páginas de colección (Fase H), paginadas como las categorías
    ...collections.map((c) => ({ ids: ids(c.products) })),
    // Landing de la correa a medida (E-2c): las correas de la tabla de precios (una por material)
    { ids: ids(tableProducts(correas)), size: Infinity },
    ...tree.all.map((n) => ({ ids: ids(productsInSubtree(products, n)) })),
    // Relacionados de cada ficha (Fase R): un bloque sin paginar por ficha
    ...[...related.values()].map((list) => ({ ids: ids(list), size: Infinity })),
  ]);
}

let devManifest: Promise<Record<string, string[]>> | undefined;

/** Ids del build para la clave de una página de listado (island de LiveSync). */
export async function listingIds(key: string): Promise<string[]> {
  if (import.meta.env.DEV) return (await (devManifest ??= buildListingManifest()))[key] ?? [];
  return readBuildManifest<string[]>(LISTING_PAGES_MANIFEST).get(key) ?? [];
}
