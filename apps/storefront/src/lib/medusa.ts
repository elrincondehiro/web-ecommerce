// Acceso a datos del storefront. Única puerta al backend (AGENTS.md §2).
// - Build (páginas estáticas): catálogo SIN precios ni stock.
// - Server islands (runtime): precios con impuestos y stock por región ES.
// - STOREFRONT_DATA=fixtures: mismos datos desde src/lib/__fixtures__ (CI sin backend).
import Medusa from "@medusajs/js-sdk";
import type { HttpTypes } from "@medusajs/types";
import { MEDUSA_BACKEND_URL, MEDUSA_PUBLISHABLE_KEY, STOREFRONT_DATA } from "astro:env/server";
import { productsInCategory, sliceRange, type StoreProduct } from "./catalog";

export type StoreCategory = HttpTypes.StoreProductCategory;
export interface StoreRegionRef {
  id: string;
  name: string;
  currency_code: string;
}

const COUNTRY_CODE = "es";
const ORDER = "title";
const CATALOG_FIELDS =
  "id,handle,title,subtitle,description,thumbnail,*images,*categories,*options,*options.values";
const PRICED_FIELDS = `${CATALOG_FIELDS},*variants,*variants.options,*variants.calculated_price,+variants.inventory_quantity`;
const CATEGORY_FIELDS = "id,name,handle,description,rank,parent_category_id";
const PAGE = 100;

const useFixtures = STOREFRONT_DATA === "fixtures";

let sdkInstance: Medusa | undefined;
function sdk(): Medusa {
  if (!MEDUSA_PUBLISHABLE_KEY) {
    throw new Error(
      "Falta MEDUSA_PUBLISHABLE_KEY. Configúrala en apps/storefront/.env o usa STOREFRONT_DATA=fixtures.",
    );
  }
  sdkInstance ??= new Medusa({
    baseUrl: MEDUSA_BACKEND_URL,
    publishableKey: MEDUSA_PUBLISHABLE_KEY,
  });
  return sdkInstance;
}

const fixtures = {
  region: async () => (await import("./__fixtures__/region.json")).default as StoreRegionRef,
  categories: async () =>
    (await import("./__fixtures__/categories.json")).default as unknown as StoreCategory[],
  products: async () =>
    (await import("./__fixtures__/products.json")).default as unknown as StoreProduct[],
};

let regionPromise: Promise<StoreRegionRef> | undefined;
/** Región de España (precios en EUR con IVA). Cacheada por proceso. */
export function getRegionES(): Promise<StoreRegionRef> {
  regionPromise ??= (async () => {
    if (useFixtures) return fixtures.region();
    const { regions } = await sdk().store.region.list({ limit: 50 });
    const region = regions.find((r) => r.countries?.some((c) => c.iso_2 === COUNTRY_CODE));
    if (!region) throw new Error(`No hay ninguna región con el país "${COUNTRY_CODE}"`);
    return { id: region.id, name: region.name ?? "", currency_code: region.currency_code ?? "eur" };
  })();
  regionPromise.catch(() => (regionPromise = undefined));
  return regionPromise;
}

/** Categorías de primer nivel ordenadas por `rank`. */
export async function getCategories(): Promise<StoreCategory[]> {
  const all = useFixtures
    ? await fixtures.categories()
    : (
        await sdk().store.category.list({
          limit: PAGE,
          fields: CATEGORY_FIELDS,
          parent_category_id: "null",
        })
      ).product_categories;
  return all.filter((c) => !c.parent_category_id).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
}

/** Todo el catálogo (sin precios) para getStaticPaths. Paginado contra la API. */
export async function getAllProducts(
  opts: { categoryId?: string | undefined } = {},
): Promise<StoreProduct[]> {
  if (useFixtures) {
    const all = await fixtures.products();
    return opts.categoryId ? productsInCategory(all, opts.categoryId) : all;
  }
  const out: StoreProduct[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { products, count } = await sdk().store.product.list({
      limit: PAGE,
      offset,
      order: ORDER,
      fields: CATALOG_FIELDS,
      ...(opts.categoryId ? { category_id: opts.categoryId } : {}),
    });
    out.push(...products);
    if (out.length >= count || products.length === 0) return out;
  }
}

/**
 * Productos CON precio y stock (server islands). Mismo orden que getAllProducts,
 * así offset/limit coinciden con la página estática.
 */
export async function getPricedProducts(q: {
  categoryId?: string | undefined;
  offset: number;
  limit: number;
}): Promise<StoreProduct[]> {
  if (useFixtures) {
    const all = await fixtures.products();
    return sliceRange(
      q.categoryId ? productsInCategory(all, q.categoryId) : all,
      q.offset,
      q.limit,
    );
  }
  const region = await getRegionES();
  const { products } = await sdk().store.product.list({
    limit: q.limit,
    offset: q.offset,
    order: ORDER,
    region_id: region.id,
    country_code: COUNTRY_CODE,
    fields: PRICED_FIELDS,
    ...(q.categoryId ? { category_id: q.categoryId } : {}),
  });
  return products;
}

/** Un producto con precio y stock por id (server island de la ficha). */
export async function getPricedProduct(id: string): Promise<StoreProduct | null> {
  if (useFixtures) return (await fixtures.products()).find((p) => p.id === id) ?? null;
  const region = await getRegionES();
  const { products } = await sdk().store.product.list({
    id: [id],
    limit: 1,
    region_id: region.id,
    country_code: COUNTRY_CODE,
    fields: PRICED_FIELDS,
  });
  return products[0] ?? null;
}
