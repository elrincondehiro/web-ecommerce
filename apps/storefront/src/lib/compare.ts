// Comparador de alimentación (Fase MK-C, docs/fases/faseMK-marketing.md §3): funciones PURAS para
// Vitest. Es la vista «tabla» de los resultados de /buscar/ (mismos filtros, orden y página),
// servida también en /comparar/ (alias legible). Los datos son los de la etiqueta del producto
// (`product.metadata`, catalog:import: proteina_pct, grasa_pct, fibra_pct, cenizas_pct,
// humedad_pct) recalculados SOBRE MATERIA SECA, el mismo cálculo que la ficha y el índice.
// Hidratos: NO están en la etiqueta; se ESTIMAN (100 − el resto) y la página lo dice siempre.
import { dryMatter, getProductPricing, type StoreProduct } from "./catalog";

export const COMPARE_PATH = "/comparar/";
export const COMPARE_PICK_PATH = "/comparar/elegidos/";
/** Productos lado a lado como mucho (y como poco, 2). */
export const COMPARE_MAX = 4;
export const COMPARE_MIN = 2;

/** Componentes de la tabla de resultados (/comparar/): solo los filtrables y ordenables. */
export const TABLE_COMPONENTS = [
  { key: "proteina_pct", label: "Proteína" },
  { key: "grasa_pct", label: "Grasa" },
] as const;

/** Componentes de la comparación lado a lado (elegidos), en este orden (claves de la metadata). */
export const COMPARE_COMPONENTS = [
  { key: "proteina_pct", label: "Proteína" },
  { key: "grasa_pct", label: "Grasa" },
  { key: "fibra_pct", label: "Fibra" },
  { key: "cenizas_pct", label: "Cenizas" },
] as const;
type ComponentKey = (typeof COMPONENT_KEYS)[number];
const COMPONENT_KEYS = COMPARE_COMPONENTS.map((c) => c.key);

/** Id del texto de los hidratos (el «*» de la cabecera enlaza aquí). */
export const CARDS_NOTE_ID = "nota-hidratos";

/** Texto fijo de los hidratos (tabla y comparación): son NUESTROS, no del fabricante. */
export const CARBS_NOTE =
  "Hidratos estimados: los calculamos nosotros como 100 − proteína − grasa − fibra − cenizas − humedad, a partir de los datos de la etiqueta. No figuran en la etiqueta del fabricante y pueden no coincidir con el valor real.";
export const DRY_MATTER_NOTE =
  "«MS» = sobre materia seca: el valor sin el agua del alimento (valor ÷ (100 − humedad) × 100). Así se comparan piensos y latas en la misma escala.";

export interface CompareRow {
  product: StoreProduct;
  /** Humedad tal cual (%), o null. */
  moisture: number | null;
  /** Componentes sobre materia seca (null = sin dato o sin humedad). */
  ms: Record<ComponentKey, number | null>;
  /** Hidratos estimados sobre materia seca, o null si falta algún dato o sale negativo. */
  carbsMs: number | null;
  /** €/kg del formato más barato con contenido en gramos (o null). */
  perKg: number | null;
  /** €/kg de materia seca: perKg ÷ (1 − humedad), o null. */
  perKgMs: number | null;
  currency: string | null;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** ¿Tiene datos para la tabla? (humedad válida y al menos la proteína). */
export function hasAnalytics(product: Pick<StoreProduct, "metadata">): boolean {
  const meta = product.metadata ?? {};
  const moisture = num(meta.humedad_pct);
  return moisture !== null && moisture >= 0 && moisture < 100 && num(meta.proteina_pct) !== null;
}

/**
 * Hidratos estimados sobre materia seca: (100 − P − G − F − C − H) / (100 − H) × 100. Hace falta
 * TODO (si no, no se inventa) y que salga ≥ 0 (si no, los datos de la etiqueta no cuadran).
 */
export function estimatedCarbsMs(meta: Record<string, unknown>): number | null {
  const moisture = num(meta.humedad_pct);
  const parts = COMPONENT_KEYS.map((k) => num(meta[k]));
  if (moisture === null || moisture < 0 || moisture >= 100 || parts.some((p) => p === null)) {
    return null;
  }
  const rest = 100 - moisture - (parts as number[]).reduce((a, b) => a + b, 0);
  if (rest < -0.05) return null;
  return round1((Math.max(0, rest) / (100 - moisture)) * 100);
}

/** €/kg de materia seca: el kilo de alimento sin agua (perKg ÷ (1 − humedad/100)). */
export function perKgDryMatter(perKg: number | null, moisture: number | null): number | null {
  if (perKg === null || moisture === null || moisture < 0 || moisture >= 100) return null;
  return round2(perKg / (1 - moisture / 100));
}

export function compareRow(product: StoreProduct): CompareRow {
  const meta = product.metadata ?? {};
  const moisture = num(meta.humedad_pct);
  const ms = Object.fromEntries(
    COMPONENT_KEYS.map((k) => {
      const v = num(meta[k]);
      return [k, v === null ? null : dryMatter(v, moisture)];
    }),
  ) as Record<ComponentKey, number | null>;
  const pricing = getProductPricing(product);
  // €/kg del formato más barato POR KILO (no el más barato en euros): es lo que se compara.
  const kgs = pricing.variants
    .map((v) => v.unitPrice)
    .filter((u): u is NonNullable<typeof u> => u !== null && u.unit === "kg")
    .map((u) => u.amount);
  const perKg = kgs.length ? Math.min(...kgs) : null;
  return {
    product,
    moisture,
    ms,
    carbsMs: estimatedCarbsMs(meta),
    perKg,
    perKgMs: perKgDryMatter(perKg, moisture),
    currency: pricing.currencyCode,
  };
}

/** Interruptor Tarjetas | Tabla: solo si algún resultado tiene datos analíticos. */
export function showCompareToggle(products: Pick<StoreProduct, "metadata">[]): boolean {
  return products.some(hasAnalytics);
}

/** Ids elegidos para comparar: válidos, sin repetir, en orden; `extra` = cuántos sobraban. */
export function parsePicked(values: string[]): { ids: string[]; extra: number } {
  const ids = [...new Set(values.filter((v) => /^prod_[0-9A-Za-z]{1,40}$/.test(v)))];
  return { ids: ids.slice(0, COMPARE_MAX), extra: Math.max(0, ids.length - COMPARE_MAX) };
}

/** Comparador con una categoría elegida (hoja) y, opcionalmente, un producto ya marcado. */
export function compareCategoryUrl(handle: string, productId?: string): string {
  const s = new URLSearchParams({ categoria: handle });
  if (productId) s.set("marcar", productId);
  return `${COMPARE_PATH}?${s.toString()}`;
}

export function comparePickUrl(ids: string[]): string {
  const s = new URLSearchParams();
  for (const id of ids) s.append("p", id);
  return `${COMPARE_PICK_PATH}?${s.toString()}`;
}
