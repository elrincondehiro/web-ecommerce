/**
 * Restricciones de un producto (Fase CS), para marcarlas con «*» en el carrito, el checkout y la
 * ficha (no en las tarjetas de los listados, decisión del usuario):
 * - `discountable = false` (columna `pago_descuento = no` de la hoja): sin códigos descuento,
 *   promociones ni pago con puntos (los puntos son una promoción en Medusa: van juntos);
 * - `metadata.genera_puntos = false` (columna `genera_puntos = no`): no genera puntos.
 * Las reglas las aplica el backend (Medusa y lib/points.ts); esto solo las explica.
 */
export const RESTRICTION_TEXT = {
  noDiscount: "No admite códigos descuento ni pago con puntos",
  noPoints: "No genera puntos",
} as const;

type ProductLike = {
  discountable?: boolean | null;
  metadata?: Record<string, unknown> | null;
} | null;

/** Notas de un producto («No genera puntos»…), vacío si no tiene restricciones. */
export function productRestrictions(product: ProductLike | undefined): string[] {
  if (!product) return [];
  const out: string[] = [];
  if (product.discountable === false) out.push(RESTRICTION_TEXT.noDiscount);
  if (product.metadata?.genera_puntos === false) out.push(RESTRICTION_TEXT.noPoints);
  return out;
}
