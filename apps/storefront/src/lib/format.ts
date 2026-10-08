// Formateo de importes para es-ES. Medusa 2.x devuelve importes en unidades mayores
// (41.95 = 41,95 €), no en céntimos: no dividir entre 100.
const formatters = new Map<string, Intl.NumberFormat>();

export function formatPrice(amount: number, currencyCode: string): string {
  const currency = currencyCode.toUpperCase();
  let fmt = formatters.get(currency);
  if (!fmt) {
    fmt = new Intl.NumberFormat("es-ES", { style: "currency", currency });
    formatters.set(currency, fmt);
  }
  return fmt.format(amount);
}

/** Descuento para mostrar: "−20 %" (signo menos U+2212 y espacio fino de no separación). */
export function formatDiscount(percent: number): string {
  return `\u2212${percent}\u202f%`;
}
