// Productos relacionados y venta cruzada (Fase R): funciones PURAS (sin astro:* ni I/O) para
// Vitest. Diseño y decisiones: docs/fases/faseR-relacionados.md.
//   - Ficha (estática, R1): los de `metadata.relacionados` (hoja del catálogo, en su orden) y, si
//     faltan para llegar a RELATED_IN_PRODUCT, otros de su categoría más concreta (relleno
//     automático). Sin descatalogados, sin el propio producto ni correas de relleno.
//   - Carrito (on-demand, R4/R5): «De tu lista de deseos» (disponibles ahora, lo más reciente
//     primero) y «Completa tu pedido» (relacionados de lo que lleva, por relevancia). Sin lo que
//     ya está en el carrito, sin repetir entre bloques.
import { getProductPricing, isDiscontinued, type StoreProduct } from "./catalog";
import { isCorrea } from "./correa";

/** Clave de metadata (backend: catalog-plan.ts META.related). Handles separados por «|». */
export const RELATED_KEY = "relacionados";
export const RELATED_IN_PRODUCT = 4;
export const RELATED_IN_CART = 3;
export const WISHLIST_IN_CART = 3;

/** Handles relacionados a mano (en su orden, sin repetidos ni vacíos). */
export function relatedHandles(product: Pick<StoreProduct, "metadata" | "handle">): string[] {
  const raw = product.metadata?.[RELATED_KEY];
  if (typeof raw !== "string" || !raw) return [];
  const out: string[] = [];
  for (const h of raw.split("|").map((s) => s.trim())) {
    if (h && h !== product.handle && !out.includes(h)) out.push(h);
  }
  return out;
}

const sellable = (p: StoreProduct) => !isDiscontinued(p);

/**
 * Relacionados de la ficha: primero los de la hoja (si existen y no están descatalogados), y si
 * no llegan a `max`, otros de la misma categoría (`sameCategory`, en el orden del catálogo), los
 * que tienen stock primero. Las correas a medida no rellenan (tienen su página de grupo).
 */
export function productRelated(
  product: StoreProduct,
  byHandle: ReadonlyMap<string, StoreProduct>,
  sameCategory: readonly StoreProduct[],
  max = RELATED_IN_PRODUCT,
): StoreProduct[] {
  const out: StoreProduct[] = [];
  const seen = new Set<string>([product.id]);
  const push = (p: StoreProduct | undefined) => {
    if (!p || seen.has(p.id) || !sellable(p) || out.length >= max) return;
    seen.add(p.id);
    out.push(p);
  };
  for (const h of relatedHandles(product)) push(byHandle.get(h));
  if (out.length < max) {
    const candidates = sameCategory.filter((p) => !isCorrea(p));
    const inStock = candidates.filter((p) => getProductPricing(p).inStock);
    const rest = candidates.filter((p) => !getProductPricing(p).inStock);
    for (const p of [...inStock, ...rest]) push(p);
  }
  return out;
}

/**
 * «Completa tu pedido» (carrito): relacionados (de la hoja) de los productos del carrito,
 * ordenados por cuántos productos del carrito los relacionan (empate: el orden en que aparecen).
 * Devuelve handles; quien llama pide los productos frescos y descarta agotados y descatalogados.
 */
export function cartRelatedHandles(
  cartProducts: readonly Pick<StoreProduct, "metadata" | "handle">[],
  exclude: ReadonlySet<string>,
): string[] {
  const score = new Map<string, { n: number; first: number }>();
  let i = 0;
  for (const p of cartProducts) {
    for (const h of relatedHandles(p)) {
      if (exclude.has(h)) continue;
      const s = score.get(h);
      if (s) s.n++;
      else score.set(h, { n: 1, first: i++ });
    }
  }
  return [...score.entries()]
    .sort((a, b) => b[1].n - a[1].n || a[1].first - b[1].first)
    .map(([h]) => h);
}

/** Producto que se puede ofrecer ahora: no descatalogado y con alguna variante con stock. */
export function availableNow(p: StoreProduct): boolean {
  return sellable(p) && getProductPricing(p).inStock;
}

/** Entrada de la lista de deseos con su producto (y variante, si se guardó una). */
export interface WishCandidate {
  product: StoreProduct;
  variantId: string | null;
  createdAt: string;
}

/**
 * «De tu lista de deseos» (carrito): lo guardado que está disponible ahora (la variante guardada
 * con stock, o cualquiera si se guardó el producto), sin lo que ya está en el carrito; lo más
 * reciente primero.
 */
export function wishlistAvailable(
  items: readonly WishCandidate[],
  inCart: { productIds: ReadonlySet<string>; variantIds: ReadonlySet<string> },
  max = WISHLIST_IN_CART,
): WishCandidate[] {
  return items
    .filter(({ product, variantId }) => {
      if (!sellable(product)) return false;
      if (variantId) {
        if (inCart.variantIds.has(variantId)) return false;
        return getProductPricing(product).variants.some((v) => v.id === variantId && v.inStock);
      }
      return !inCart.productIds.has(product.id) && getProductPricing(product).inStock;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, max);
}
