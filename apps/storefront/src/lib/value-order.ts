// Orden natural de valores de opción y de variantes (sin I/O). IDÉNTICO en
// apps/backend/src/lib/value-order.ts (lo usa el widget «Orden de las variantes» del Admin); un
// test lo comprueba.
//   - Tallas XXS…XXXL en su orden.
//   - Cantidades con unidad (g, kg, ml, l, cm, m, mm) por su magnitud: 500 g < 1 kg.
//   - El resto alfabético con números (2 < 10), sin distinguir mayúsculas ni tildes.

const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];

// Unidades → factor a la unidad base de su magnitud (masa en g, volumen en ml, longitud en mm).
const UNITS: Record<string, [string, number]> = {
  g: ["masa", 1],
  gr: ["masa", 1],
  kg: ["masa", 1000],
  ml: ["volumen", 1],
  cl: ["volumen", 10],
  l: ["volumen", 1000],
  mm: ["longitud", 1],
  cm: ["longitud", 10],
  m: ["longitud", 1000],
};
const QUANTITY = /^(\d+(?:[.,]\d+)?)\s*([a-z]+)$/i;

function quantity(value: string): [string, number] | null {
  const m = QUANTITY.exec(value.trim());
  const unit = m && UNITS[m[2]!.toLowerCase()];
  return unit ? [unit[0], Number(m![1]!.replace(",", ".")) * unit[1]] : null;
}

/** Orden de presentación de dos valores de una opción. */
export function compareValues(a: string, b: string): number {
  const ia = SIZE_ORDER.indexOf(a.trim().toUpperCase());
  const ib = SIZE_ORDER.indexOf(b.trim().toUpperCase());
  if (ia !== -1 && ib !== -1) return ia - ib;
  const qa = quantity(a);
  const qb = quantity(b);
  if (qa && qb && qa[0] === qb[0] && qa[1] !== qb[1]) return qa[1] - qb[1];
  return a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });
}

export interface RankedVariant {
  variant_rank?: number | null | undefined;
  /** Valores de la variante en el orden de las opciones del producto. */
  values: string[];
}

/**
 * Orden de las variantes: `variant_rank` (de la hoja del catálogo o del widget del Admin) y, con el
 * mismo rango o sin él, el orden natural de sus valores, opción a opción.
 */
export function compareVariants(a: RankedVariant, b: RankedVariant): number {
  const ra = a.variant_rank ?? 0;
  const rb = b.variant_rank ?? 0;
  if (ra !== rb) return ra - rb;
  for (let i = 0; i < Math.max(a.values.length, b.values.length); i++) {
    const c = compareValues(a.values[i] ?? "", b.values[i] ?? "");
    if (c !== 0) return c;
  }
  return 0;
}
