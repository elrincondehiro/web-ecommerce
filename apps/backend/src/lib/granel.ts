/**
 * Venta a granel (ver `catalog/plantilla/LEEME.md`): la unidad de venta es un paso de
 * `paso_g` gramos y la variante guarda en metadata el paso y el mínimo por pedido.
 */
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

/** Precio del mínimo (pasos del mínimo × precio de un paso), en céntimos exactos. */
export function bulkMinimumAmount(rule: BulkRule, stepAmount: number): number {
  return Math.round(stepAmount * 100 * Math.ceil(rule.minG / rule.stepG)) / 100;
}

const grams = (g: number) =>
  g >= 1000 && g % 100 === 0 ? `${String(g / 1000).replace(".", ",")} kg` : `${g} g`;

/**
 * Mensaje de error si `units` pasos no llegan al mínimo (`null` si vale). Cero unidades = quitar
 * la línea, siempre permitido.
 */
export function bulkMinimumError(rule: BulkRule, units: number): string | null {
  if (units <= 0 || units * rule.stepG >= rule.minG) return null;
  const minUnits = Math.ceil(rule.minG / rule.stepG);
  return (
    `El mínimo de este producto a granel es ${grams(rule.minG)}` +
    (rule.stepG > 1 ? ` (${minUnits} unidades de ${grams(rule.stepG)})` : "") +
    "."
  );
}
