// Funciones puras sobre productos de la Store API (sin I/O): testeables con Vitest.
import type { HttpTypes } from "@medusajs/types";

export type StoreProduct = HttpTypes.StoreProduct;
export type StoreVariant = HttpTypes.StoreProductVariant;

/** Precio por unidad de medida (RD 3423/2000): €/kg (contenido neto en g) o €/l (en ml). */
export interface UnitPrice {
  amount: number;
  unit: "kg" | "l";
}

export interface VariantAvailability {
  id: string;
  title: string;
  amount: number | null;
  /** Precio por kilo o litro de `amount`, o null sin contenido neto. */
  unitPrice: UnitPrice | null;
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
  /** Precio por kilo/litro de la variante de `fromAmount`, o null. */
  unitPrice: UnitPrice | null;
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

/**
 * Contenido neto de la variante (catalog:import: `variant.metadata.neto_g` / `neto_ml`, Fase C).
 * Un número positivo; cualquier otra cosa → null.
 */
export function variantNet(variant: StoreVariant): { amount: number; unit: "g" | "ml" } | null {
  const meta = variant.metadata ?? {};
  for (const unit of ["g", "ml"] as const) {
    const v = meta[`neto_${unit}`];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return { amount: v, unit };
  }
  return null;
}

/** €/kg o €/l: precio / contenido × 1000, redondeado a céntimos. */
export function unitPrice(amount: number | null, variant: StoreVariant): UnitPrice | null {
  const net = variantNet(variant);
  if (amount === null || !net) return null;
  return {
    amount: Math.round((amount / net.amount) * 1000 * 100) / 100,
    unit: net.unit === "g" ? "kg" : "l",
  };
}

/** Descuento en % entero, redondeado hacia abajo (nunca se anuncia más de lo real). */
export function discountPercent(now: number, was: number): number {
  return Math.floor(((was - now) / was) * 100 + 1e-9);
}

export function getProductPricing(product: StoreProduct): ProductPricing {
  const variants = (product.variants ?? []).map((v) => {
    const amount = variantAmount(v);
    return {
      id: v.id,
      title: v.title ?? "",
      amount,
      unitPrice: unitPrice(amount, v),
      wasAmount: variantWasAmount(v),
      inStock: isVariantInStock(v),
    };
  });
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
    unitPrice: cheapest?.unitPrice ?? null,
    inStock: variants.some((v) => v.inStock),
    variants,
  };
}

/** Descripción corta para meta description (≤ 160 caracteres, sin cortar palabras). */
export function metaDescription(text: string | null | undefined, max = 160): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : cut.length)}…`;
}

// ── Componentes analíticos (Fase S, S-2) ─────────────────────────────────────────────────

/** Componentes con nombre fijo (catalog:import, `product.metadata.<clave>`), en este orden. */
export const ANALYTIC_COMPONENTS = [
  { key: "proteina_pct", label: "Proteína bruta", dryMatter: true },
  { key: "grasa_pct", label: "Grasa bruta", dryMatter: true },
  { key: "fibra_pct", label: "Fibra bruta", dryMatter: true },
  { key: "cenizas_pct", label: "Cenizas brutas", dryMatter: true },
  { key: "humedad_pct", label: "Humedad", dryMatter: false },
] as const;
const ANALYTIC_PREFIX = "analitico:";

export interface AnalyticRow {
  label: string;
  /** Valor tal cual: número (%) o texto libre de `analitico:X` («1,2 %»). */
  value: number | string;
  /** % sobre materia seca (solo componentes numéricos con humedad válida), o null. */
  dryMatter: number | null;
}

/** % sobre materia seca con un decimal (mismo cálculo que el índice, backend lib/dry-matter). */
export function dryMatter(value: number, moisture: number | null): number | null {
  if (moisture === null || moisture < 0 || moisture >= 100 || value < 0) return null;
  return Math.round((value / (100 - moisture)) * 1000) / 10;
}

/**
 * Filas de la tabla de componentes analíticos: los fijos (si existen) y después los
 * `analitico:<Nombre>` en el orden de la metadata (el de la hoja). Vacío = sin tabla.
 */
export function analyticRows(product: Pick<StoreProduct, "metadata">): AnalyticRow[] {
  const meta = product.metadata ?? {};
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const moisture = num(meta.humedad_pct);
  const rows: AnalyticRow[] = [];
  for (const c of ANALYTIC_COMPONENTS) {
    const v = num(meta[c.key]);
    if (v === null) continue;
    rows.push({ label: c.label, value: v, dryMatter: c.dryMatter ? dryMatter(v, moisture) : null });
  }
  for (const [key, v] of Object.entries(meta)) {
    if (!key.startsWith(ANALYTIC_PREFIX)) continue;
    const label = key.slice(ANALYTIC_PREFIX.length).trim();
    if (label && (typeof v === "string" ? v.trim() : num(v) !== null)) {
      rows.push({
        label,
        value: typeof v === "string" ? v.trim() : (v as number),
        dryMatter: null,
      });
    }
  }
  return rows;
}
