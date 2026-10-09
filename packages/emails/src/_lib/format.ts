/**
 * Formato de importes y fechas en español. Los importes llegan en **unidad principal**
 * (Medusa v2: 4.95 = 4,95 €), nunca en céntimos.
 */
export function formatMoney(amount: number, currencyCode = "eur"): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: currencyCode.toUpperCase(),
  }).format(amount);
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Madrid",
  }).format(new Date(iso));
}

/** Tipo de IVA legible: 21 → "21 %", 10.5 → "10,5 %". */
export function formatRate(rate: number): string {
  return `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(rate)} %`;
}
