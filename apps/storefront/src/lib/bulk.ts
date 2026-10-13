// Venta a granel (Fase S, S-3). Funciones PURAS (sin I/O). Modelo del backend
// (`catalog/plantilla/LEEME.md`, `apps/backend/src/lib/granel.ts`): la unidad de venta de una
// variante a granel es un PASO de `metadata.paso_g` gramos; `metadata.min_g` es el mínimo por
// pedido (múltiplo del paso). En Medusa, cantidad = nº de pasos y precio = precio de un paso.
// El storefront habla en GRAMOS: gramos = cantidad × paso.
// La regla sale SIEMPRE de la metadata de la VARIANTE (dato del servidor; `paso_g` no se puede
// cambiar una vez creada), nunca del formulario ni de la metadata de la línea: la Store API deja
// escribir esa a cualquiera y un `paso_g` falso haría que el pedido dijera «1 kg» por un paso.
// Líneas de carrito y pedido: `*items.variant` (Store API 2.21.2; `items.variant.metadata` suelto
// no está permitido y se descarta). Variante borrada → la línea se muestra en unidades.
import { CATALOG_FEATURES } from "./constants";

/** Máximo por línea (gramos), `CATALOG_FEATURES.bulkMaxG`. */
export const BULK_MAX_G: number = CATALOG_FEATURES.bulkMaxG;
/** Accesos rápidos de la ficha (se muestran los que cumplen paso, mínimo y máximo). */
export const BULK_QUICK_G = [100, 250, 500, 1000] as const;

export interface BulkRule {
  stepG: number;
  minG: number;
}

const positiveInt = (v: unknown) =>
  typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null;

/** Regla de granel de la metadata de una variante (`null` si no es a granel). */
export function bulkRule(metadata: Record<string, unknown> | null | undefined): BulkRule | null {
  const stepG = positiveInt(metadata?.paso_g);
  if (!stepG) return null;
  return { stepG, minG: positiveInt(metadata?.min_g) ?? stepG };
}

/** Pasos mínimos (el mínimo redondeado hacia arriba al paso). */
export function minUnits(rule: BulkRule): number {
  return Math.ceil(rule.minG / rule.stepG);
}

/** Importe de `units` pasos a `stepAmount` cada uno, en céntimos exactos. */
export function unitsAmount(stepAmount: number, units: number): number {
  return Math.round(stepAmount * 100 * units) / 100;
}

/** €/kg de un paso: precio × 1000 / paso, a céntimos. */
export function kgPrice(stepAmount: number, rule: BulkRule): number {
  return Math.round(((stepAmount * 1000) / rule.stepG) * 100) / 100;
}

/** Hay stock si caben al menos los pasos del mínimo. */
export function bulkInStock(units: number, rule: BulkRule): boolean {
  return units >= minUnits(rule);
}

export type GramsCheck =
  { ok: true; units: number } | { ok: false; code: "invalid" | "minimum" | "maximum" };

/**
 * Valida unos gramos pedidos: múltiplo del paso, ≥ mínimo y ≤ máximo (contando `alreadyG`, lo
 * que ya hay de esa variante en el carrito). Devuelve los pasos para Medusa.
 */
export function checkGrams(grams: number, rule: BulkRule, alreadyG = 0): GramsCheck {
  if (!Number.isInteger(grams) || grams <= 0 || grams % rule.stepG !== 0) {
    return { ok: false, code: "invalid" };
  }
  if (grams + alreadyG > BULK_MAX_G) return { ok: false, code: "maximum" };
  if (grams + alreadyG < rule.minG) return { ok: false, code: "minimum" };
  return { ok: true, units: grams / rule.stepG };
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/**
 * Regla común a varias variantes a granel (sabores) para un único campo de gramos: paso = mcm
 * de los pasos y mínimo = el mayor, redondeado al paso. Así cualquier valor vale para todas
 * (la action valida igualmente con la regla de la variante elegida).
 */
export function commonRule(rules: BulkRule[]): BulkRule | null {
  if (!rules.length) return null;
  const stepG = rules.reduce((acc, r) => (acc * r.stepG) / gcd(acc, r.stepG), 1);
  const minG = Math.ceil(Math.max(...rules.map((r) => r.minG)) / stepG) * stepG;
  return { stepG, minG };
}

/** Accesos rápidos válidos para una regla. */
export function quickGrams(rule: BulkRule): number[] {
  return BULK_QUICK_G.filter((g) => g >= rule.minG && g <= BULK_MAX_G && g % rule.stepG === 0);
}

/** «250 g», «1 kg», «2,45 kg». */
export function formatGrams(grams: number): string {
  if (grams < 1000) return `${grams}\u00a0g`;
  return `${(grams / 1000).toLocaleString("es-ES", { maximumFractionDigits: 3 })}\u00a0kg`;
}

/** Stock que se anuncia («Quedan 2,4 kg»): a partir de 1 kg, redondeado hacia abajo a 100 g. */
export function formatStockGrams(grams: number): string {
  return formatGrams(grams >= 1000 ? Math.floor(grams / 100) * 100 : grams);
}

/** Línea de carrito o pedido con su variante (`*items.variant`). */
export interface LineLike {
  quantity?: number | null;
  variant?: { metadata?: Record<string, unknown> | null } | null;
}

/** Regla de granel de una línea (la de su variante), o null si es de unidades. */
export function lineRule(item: LineLike): BulkRule | null {
  return bulkRule(item.variant?.metadata);
}

/** Gramos de una línea a granel, o null. */
export function lineGrams(item: LineLike): number | null {
  const rule = lineRule(item);
  return rule ? (item.quantity ?? 0) * rule.stepG : null;
}

/** «250 g ·» (granel) o «2 ×» (unidades): prefijo de la línea en resúmenes y pedidos. */
export function lineQuantityLabel(item: LineLike): string {
  const grams = lineGrams(item);
  return grams !== null ? `${formatGrams(grams)} ·` : `${item.quantity ?? 0} ×`;
}
