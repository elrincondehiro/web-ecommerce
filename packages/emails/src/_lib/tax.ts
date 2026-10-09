/**
 * Desglose de IVA por tipo para el email de pedido (precios con IVA incluido).
 *
 * Cada línea (producto o envío) aporta su total con IVA, su IVA y el tipo aplicado
 * (suma de `tax_lines[].rate` en Medusa). Se agrupa por tipo: base imponible = total − IVA.
 * Se redondea al final, por grupo, para no acumular errores de céntimos.
 */
export type TaxableLine = {
  /** Tipo aplicado en %, p. ej. 21. */
  rate: number;
  /** Total de la línea con IVA, tras descuentos. */
  total: number;
  /** IVA de la línea, tras descuentos. */
  taxTotal: number;
};

export type TaxBreakdownRow = {
  rate: number;
  base: number;
  tax: number;
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function buildTaxBreakdown(lines: TaxableLine[]): TaxBreakdownRow[] {
  const byRate = new Map<number, { base: number; tax: number }>();
  for (const line of lines) {
    if (line.total === 0 && line.taxTotal === 0) continue;
    const row = byRate.get(line.rate) ?? { base: 0, tax: 0 };
    row.base += line.total - line.taxTotal;
    row.tax += line.taxTotal;
    byRate.set(line.rate, row);
  }
  return [...byRate.entries()]
    .sort(([a], [b]) => b - a)
    .map(([rate, { base, tax }]) => ({ rate, base: round2(base), tax: round2(tax) }));
}
