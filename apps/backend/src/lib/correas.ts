/**
 * Correa a medida (Fase E-2). Cada color × material es un producto con una variante por
 * largo × mosquetón lado perro × mosquetón lado mano; cada variante es un inventory kit
 * (cuerda en metros + mosquetones + anillas + hebillas). Lo genera `correas:sync`
 * (`src/scripts/correas-sync.ts`) desde `catalog/<carpeta>/correas`.
 *
 * Aquí: las claves de metadata que comparten el script, el hook del carrito, la ruta de
 * disponibilidad y el storefront, y la validación de los datos que el cliente añade a la línea.
 */

/** `product.metadata.plantilla`: el storefront pinta la ficha con el configurador. */
export const CORREA_TEMPLATE = "correa";
/** `product.metadata.grupo`: las correas salen como una sola tarjeta en listados y búsqueda. */
export const CORREA_GROUP = "correa";

/** Claves de `variant.metadata`. */
export const CORREA_VARIANT_META = {
  length: "largo_m",
  dogClip: "mosqueton_perro",
  handClip: "mosqueton_mano",
} as const;

/** Claves de `line_item.metadata` que puede mandar el cliente (solo en líneas de correa). */
export const CORREA_LINE_META = {
  notes: "observaciones",
  exactCm: "medida_cm",
} as const;

export const NOTES_MAX = 200;

export function isCorrea(metadata: Record<string, unknown> | null | undefined): boolean {
  return metadata?.plantilla === CORREA_TEMPLATE;
}

/** Largo de la variante (metros enteros) leído de su metadata. */
export function variantLength(metadata: Record<string, unknown> | null | undefined) {
  const v = metadata?.[CORREA_VARIANT_META.length];
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null;
}

/** Medida exacta válida para un largo: (largo − 1) m < medida ≤ largo m, en centímetros. */
export function exactRange(lengthM: number) {
  return { minCm: (lengthM - 1) * 100 + 1, maxCm: lengthM * 100 };
}

// Caracteres de control (salvo el salto de línea), que no pintan nada en el taller ni en el email
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0009\u000b-\u001f\u007f]/;

/**
 * Valida la metadata que el cliente pone en una línea. `isCorreaLine` = la variante es de una
 * correa; `lengthM` = su largo. Devuelve el mensaje de error o `null`.
 * - Las líneas que no son de correa no admiten metadata (nadie la usa; evita que un cliente
 *   guarde datos arbitrarios en el pedido).
 * - En las de correa solo `observaciones` (texto ≤ 200) y `medida_cm` (entero en el tramo del largo).
 */
export function lineMetadataError(
  metadata: unknown,
  isCorreaLine: boolean,
  lengthM: number | null,
): string | null {
  if (metadata === undefined || metadata === null) return null;
  if (typeof metadata !== "object" || Array.isArray(metadata))
    return "Datos de la línea no válidos.";
  const entries = Object.entries(metadata as Record<string, unknown>).filter(
    ([, v]) => v !== undefined && v !== null && v !== "",
  );
  if (!entries.length) return null;
  if (!isCorreaLine) return "Este producto no admite datos adicionales.";
  const allowed = new Set<string>(Object.values(CORREA_LINE_META));
  for (const [key, value] of entries) {
    if (!allowed.has(key)) return "Datos de la línea no válidos.";
    if (key === CORREA_LINE_META.notes) {
      if (typeof value !== "string") return "Las observaciones deben ser texto.";
      if ([...value].length > NOTES_MAX) {
        return `Las observaciones no pueden pasar de ${NOTES_MAX} caracteres.`;
      }
      if (CONTROL_RE.test(value)) return "Las observaciones tienen caracteres no válidos.";
    }
    if (key === CORREA_LINE_META.exactCm) {
      if (typeof value !== "number" || !Number.isInteger(value) || lengthM === null) {
        return "La medida exacta no es válida.";
      }
      const { minCm, maxCm } = exactRange(lengthM);
      if (value < minCm || value > maxCm) {
        const m = (cm: number) => String(cm / 100).replace(".", ",");
        return `Para una correa de ${lengthM} m, la medida exacta va de ${m(minCm)} a ${m(maxCm)} m.`;
      }
    }
  }
  return null;
}
