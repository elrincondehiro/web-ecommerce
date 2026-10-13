// Funciones puras sobre productos de la Store API (sin I/O): testeables con Vitest.
import type { HttpTypes } from "@medusajs/types";
import {
  bulkInStock,
  bulkRule,
  formatGrams,
  kgPrice,
  minUnits,
  unitsAmount,
  type BulkRule,
} from "./bulk";

export type StoreProduct = HttpTypes.StoreProduct;
export type StoreVariant = HttpTypes.StoreProductVariant;

/**
 * Descatalogado (Fase E, opción i; `catalog:import`, columna `descatalogado`): la ficha se sigue
 * generando (aviso, `noindex`, enlace al sustituto o a su categoría, sin botón de compra) pero no
 * sale en listados, búsqueda ni sitemap. El backend tampoco deja añadirlo al carrito.
 */
export function isDiscontinued(product: Pick<StoreProduct, "metadata">): boolean {
  return product.metadata?.["descatalogado"] === true;
}

/** Handle del producto que sustituye a uno descatalogado, o null. */
export function replacementHandle(product: Pick<StoreProduct, "metadata">): string | null {
  const h = product.metadata?.["sustituto"];
  return typeof h === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(h) ? h : null;
}

/** Precio por unidad de medida (RD 3423/2000): €/kg (contenido neto en g) o €/l (en ml). */
export interface UnitPrice {
  amount: number;
  unit: "kg" | "l";
}

/** Variante a granel (S-3): regla, €/kg y stock en gramos. */
export interface BulkInfo extends BulkRule {
  /** Precio de un paso (el de Medusa): el total es pasos × esto. */
  stepAmount: number;
  /** Gramos disponibles (pasos × paso), o null si no gestiona inventario o admite backorder. */
  stockG: number | null;
}

export interface VariantAvailability {
  id: string;
  title: string;
  /** Precio con IVA; en granel, el del mínimo (`min_g`), que es lo mínimo que se paga. */
  amount: number | null;
  /** Precio por kilo o litro de `amount`, o null sin contenido neto. */
  unitPrice: UnitPrice | null;
  /** Precio anterior (base) si `amount` es una rebaja de una Price List `sale`; si no, null. */
  wasAmount: number | null;
  inStock: boolean;
  /** Solo variantes a granel; null en las de unidades. */
  bulk: BulkInfo | null;
}

export interface ProductPricing {
  /** Precio mínimo con impuestos entre variantes con precio. */
  fromAmount: number | null;
  currencyCode: string | null;
  /** true si las variantes tienen precios distintos o hay granel ("Desde …"). */
  hasPriceRange: boolean;
  /** Precio anterior de la variante de `fromAmount` si está rebajada (oferta); si no, null. */
  wasAmount: number | null;
  /** Descuento entero (%) de esa variante, o null. */
  discountPercent: number | null;
  /** Precio por kilo/litro de la variante de `fromAmount`, o null. */
  unitPrice: UnitPrice | null;
  inStock: boolean;
  /** Alguna variante es a granel (la ficha pide gramos; la tarjeta enlaza a la ficha). */
  isBulk: boolean;
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

/**
 * Precio, €/kg y stock de una variante a granel (S-3). Medusa guarda el precio de un PASO y el
 * stock en pasos (`inventory_quantity` = gramos disponibles / paso, por `required_quantity`).
 * Se anuncia el precio del mínimo («Desde 2,00 €» por 100 g) y el €/kg.
 */
function bulkVariant(v: StoreVariant, rule: BulkRule): VariantAvailability {
  const step = variantAmount(v);
  const wasStep = variantWasAmount(v);
  const n = minUnits(rule);
  const units = v.inventory_quantity ?? 0;
  const unlimited = v.manage_inventory === false || Boolean(v.allow_backorder);
  return {
    id: v.id,
    title: v.title ?? "",
    amount: step === null ? null : unitsAmount(step, n),
    unitPrice: step === null ? null : { amount: kgPrice(step, rule), unit: "kg" },
    wasAmount: wasStep === null ? null : unitsAmount(wasStep, n),
    inStock: unlimited || bulkInStock(units, rule),
    bulk:
      step === null
        ? null
        : { ...rule, stepAmount: step, stockG: unlimited ? null : units * rule.stepG },
  };
}

export function getProductPricing(product: StoreProduct): ProductPricing {
  const variants = (product.variants ?? []).map((v): VariantAvailability => {
    const rule = bulkRule(v.metadata);
    if (rule) return bulkVariant(v, rule);
    const amount = variantAmount(v);
    return {
      id: v.id,
      title: v.title ?? "",
      amount,
      unitPrice: unitPrice(amount, v),
      wasAmount: variantWasAmount(v),
      inStock: isVariantInStock(v),
      bulk: null,
    };
  });
  const isBulk = variants.some((v) => v.bulk !== null);
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
    hasPriceRange: isBulk || new Set(amounts).size > 1,
    wasAmount,
    discountPercent:
      wasAmount !== null && fromAmount !== null ? discountPercent(fromAmount, wasAmount) : null,
    unitPrice: cheapest?.unitPrice ?? null,
    inStock: variants.some((v) => v.inStock),
    isBulk,
    variants,
  };
}

/** «mínimo 100 g» del precio «Desde» de un producto a granel (variante más barata), o null. */
export function minimumNote(pricing: ProductPricing): string | null {
  const v = pricing.variants.find((x) => x.bulk && x.amount === pricing.fromAmount);
  return v?.bulk ? `mínimo ${formatGrams(v.bulk.minG)}` : null;
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
