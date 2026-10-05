// Facetas de los listados estáticos (fase 7-1, D2): se calculan en el BUILD a partir de los
// productos de la categoría (o de todo el catálogo), sin lista fija de opciones. Un valor solo
// se ofrece si lo comparten ≥ MIN_PRODUCTS productos (evita valores sueltos tipo "Formato" de
// un solo producto). En /buscar/ las mismas facetas llegan del motor con recuentos en vivo.
// Funciones PURAS (Vitest).
import { getProductPricing, type StoreProduct } from "./catalog";
import type { FacetValue } from "./search";

export const MIN_PRODUCTS = 2;

export interface FacetGroup {
  /** Clave del parámetro de URL. */
  key: "categoria" | "etiqueta" | "opcion";
  /** Para `opcion`, el título de la opción (Talla, Color…). */
  title: string;
  values: { value: string; label: string; count?: number | undefined }[];
}

export interface ListingFacets {
  groups: FacetGroup[];
  price: { min: number; max: number } | null;
  /** Hay productos con y sin stock: el filtro "Disponible" tiene sentido. */
  stockFilter: boolean;
}

const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];

/** Orden de presentación: tallas en su orden natural; el resto alfabético con números. */
export function compareValues(a: string, b: string): number {
  const ia = SIZE_ORDER.indexOf(a.toUpperCase());
  const ib = SIZE_ORDER.indexOf(b.toUpperCase());
  if (ia !== -1 && ib !== -1) return ia - ib;
  return a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });
}

function addCount(map: Map<string, Set<string>>, key: string, productId: string) {
  const set = map.get(key) ?? new Set<string>();
  set.add(productId);
  map.set(key, set);
}

const frequent = (map: Map<string, Set<string>>, min: number) =>
  [...map.entries()].filter(([, ids]) => ids.size >= min).map(([v, ids]) => [v, ids.size] as const);

/**
 * Facetas válidas para un listado. `categories` = { handle → nombre } si el listado mezcla
 * categorías (p. ej. /productos/); en una categoría no se ofrece ese filtro.
 */
export function buildListingFacets(
  products: StoreProduct[],
  opts: { categories?: Map<string, string>; min?: number } = {},
): ListingFacets {
  const min = opts.min ?? MIN_PRODUCTS;
  const categories = new Map<string, Set<string>>();
  const tags = new Map<string, Set<string>>();
  const options = new Map<string, Map<string, Set<string>>>();
  let lo = Infinity;
  let hi = -Infinity;
  let inStock = 0;

  for (const p of products) {
    for (const c of p.categories ?? []) if (c?.handle) addCount(categories, c.handle, p.id);
    for (const t of p.tags ?? []) if (t?.value) addCount(tags, t.value, p.id);
    for (const o of p.options ?? []) {
      const title = o?.title?.trim();
      if (!title) continue;
      const byValue = options.get(title) ?? new Map<string, Set<string>>();
      for (const v of o.values ?? []) {
        const value = v?.value?.trim();
        if (value) addCount(byValue, value, p.id);
      }
      options.set(title, byValue);
    }
    const pricing = getProductPricing(p);
    for (const v of pricing.variants) {
      if (v.amount !== null) {
        lo = Math.min(lo, v.amount);
        hi = Math.max(hi, v.amount);
      }
    }
    if (pricing.inStock) inStock++;
  }

  const groups: FacetGroup[] = [];
  if (opts.categories) {
    const values = frequent(categories, 1)
      .filter(([handle]) => opts.categories!.has(handle))
      .map(([value]) => ({ value, label: opts.categories!.get(value)! }))
      .sort((a, b) => compareValues(a.label, b.label));
    if (values.length > 1) groups.push({ key: "categoria", title: "Categoría", values });
  }
  for (const [title, byValue] of [...options.entries()].sort(([a], [b]) => compareValues(a, b))) {
    const values = frequent(byValue, min)
      .map(([value]) => ({ value: `${title}:${value}`, label: value }))
      .sort((a, b) => compareValues(a.label, b.label));
    if (values.length) groups.push({ key: "opcion", title, values });
  }
  const tagValues = frequent(tags, min)
    .map(([value]) => ({ value, label: value }))
    .sort((a, b) => compareValues(a.label, b.label));
  if (tagValues.length) groups.push({ key: "etiqueta", title: "Etiquetas", values: tagValues });

  return {
    groups,
    price: Number.isFinite(lo) && hi > lo ? { min: Math.floor(lo), max: Math.ceil(hi) } : null,
    stockFilter: inStock > 0 && inStock < products.length,
  };
}

/** Facetas de /buscar/ a partir de los recuentos del motor (mismas reglas de orden). */
export function facetsFromSearch(
  facets: {
    categoria: FacetValue[];
    etiqueta: FacetValue[];
    opcion: FacetValue[];
    disponible: number;
    price: { min: number; max: number } | null;
  },
  opts: {
    categories: Map<string, string>;
    selected: Set<string>;
    total: number;
    /** "Disponible" marcado: se sigue mostrando para poder desmarcarlo. */
    disponible?: boolean;
  },
): ListingFacets {
  // Lo marcado se muestra siempre (aunque su recuento sea 0) para poder desmarcarlo.
  const keep = (f: FacetValue) => f.count >= 1 || opts.selected.has(f.value);
  const groups: FacetGroup[] = [];
  const categoria = facets.categoria
    .filter((f) => keep(f) && opts.categories.has(f.value))
    .map((f) => ({ value: f.value, label: opts.categories.get(f.value)!, count: f.count }))
    .sort((a, b) => compareValues(a.label, b.label));
  if (categoria.length) groups.push({ key: "categoria", title: "Categoría", values: categoria });

  const byTitle = new Map<string, FacetGroup["values"]>();
  for (const f of facets.opcion.filter(keep)) {
    const i = f.value.indexOf(":");
    if (i < 1) continue;
    const title = f.value.slice(0, i);
    byTitle.set(title, [
      ...(byTitle.get(title) ?? []),
      { value: f.value, label: f.value.slice(i + 1), count: f.count },
    ]);
  }
  for (const [title, values] of [...byTitle.entries()].sort(([a], [b]) => compareValues(a, b))) {
    groups.push({
      key: "opcion",
      title,
      values: values.sort((a, b) => compareValues(a.label, b.label)),
    });
  }
  const etiqueta = facets.etiqueta
    .filter(keep)
    .map((f) => ({ value: f.value, label: f.value, count: f.count }))
    .sort((a, b) => compareValues(a.label, b.label));
  if (etiqueta.length) groups.push({ key: "etiqueta", title: "Etiquetas", values: etiqueta });

  return {
    groups,
    price: facets.price
      ? { min: Math.floor(facets.price.min), max: Math.ceil(facets.price.max) }
      : null,
    stockFilter:
      Boolean(opts.disponible) || (facets.disponible > 0 && facets.disponible < opts.total),
  };
}
