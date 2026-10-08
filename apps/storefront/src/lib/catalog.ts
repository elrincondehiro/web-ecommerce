// Funciones puras sobre productos de la Store API (sin I/O): testeables con Vitest.
import type { HttpTypes } from "@medusajs/types";

export type StoreProduct = HttpTypes.StoreProduct;
export type StoreVariant = HttpTypes.StoreProductVariant;

export interface VariantAvailability {
  id: string;
  title: string;
  amount: number | null;
  /** Precio anterior (base) si `amount` es una rebaja de una Price List `sale`; si no, null. */
  wasAmount: number | null;
  inStock: boolean;
}

export interface ProductPricing {
  /** Precio mínimo con impuestos entre variantes con precio. */
  fromAmount: number | null;
  currencyCode: string | null;
  /** true si las variantes tienen precios distintos ("Desde …"). */
  hasPriceRange: boolean;
  /** Precio anterior de la variante de `fromAmount` si está rebajada (oferta); si no, null. */
  wasAmount: number | null;
  /** Descuento entero (%) de esa variante, o null. */
  discountPercent: number | null;
  inStock: boolean;
  variants: VariantAvailability[];
}

/** Disponible si no gestiona inventario, admite backorder o tiene stock (> 0). */
export function isVariantInStock(variant: StoreVariant): boolean {
  if (variant.manage_inventory === false) return true;
  if (variant.allow_backorder) return true;
  return (variant.inventory_quantity ?? 0) > 0;
}

export function variantAmount(variant: StoreVariant): number | null {
  const price = variant.calculated_price;
  if (!price) return null;
  const amount = price.calculated_amount_with_tax ?? price.calculated_amount;
  return typeof amount === "number" ? amount : null;
}

/**
 * Precio anterior de una variante rebajada: el original con IVA, solo si el calculado viene de
 * una Price List `sale` y es menor (Medusa 2.21: `calculated_price.calculated_price
 * .price_list_type`; una lista `sale` nunca es el original). Omnibus: el original es el precio
 * base, que no cambia. Fuente: context7 /medusajs/medusa (storefront "sale price").
 */
export function variantWasAmount(variant: StoreVariant): number | null {
  const price = variant.calculated_price;
  if (!price || price.calculated_price?.price_list_type !== "sale") return null;
  const was = price.original_amount_with_tax ?? price.original_amount;
  const now = variantAmount(variant);
  return typeof was === "number" && now !== null && was > now ? was : null;
}

/** Descuento en % entero, redondeado hacia abajo (nunca se anuncia más de lo real). */
export function discountPercent(now: number, was: number): number {
  return Math.floor(((was - now) / was) * 100 + 1e-9);
}

export function getProductPricing(product: StoreProduct): ProductPricing {
  const variants = (product.variants ?? []).map((v) => ({
    id: v.id,
    title: v.title ?? "",
    amount: variantAmount(v),
    wasAmount: variantWasAmount(v),
    inStock: isVariantInStock(v),
  }));
  const amounts = variants.map((v) => v.amount).filter((a): a is number => a !== null);
  const fromAmount = amounts.length ? Math.min(...amounts) : null;
  const currencyCode =
    product.variants?.find((v) => v.calculated_price?.currency_code)?.calculated_price
      ?.currency_code ?? null;
  // "Desde" + oferta: se anuncia la de la variante más barata (la del precio mostrado).
  const cheapest = variants.find((v) => v.amount === fromAmount);
  const wasAmount = cheapest?.wasAmount ?? null;
  return {
    fromAmount,
    currencyCode,
    hasPriceRange: new Set(amounts).size > 1,
    wasAmount,
    discountPercent:
      wasAmount !== null && fromAmount !== null ? discountPercent(fromAmount, wasAmount) : null,
    inStock: variants.some((v) => v.inStock),
    variants,
  };
}

/** Rango [offset, offset+limit) de una lista; para paginar fixtures igual que la Store API. */
export function sliceRange<T>(items: T[], offset = 0, limit = items.length): T[] {
  return items.slice(Math.max(0, offset), Math.max(0, offset) + Math.max(0, limit));
}

export function productsInCategory(products: StoreProduct[], categoryId: string): StoreProduct[] {
  return products.filter((p) => p.categories?.some((c) => c.id === categoryId));
}

/** Descripción corta para meta description (≤ 160 caracteres, sin cortar palabras). */
export function metaDescription(text: string | null | undefined, max = 160): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : cut.length)}…`;
}
