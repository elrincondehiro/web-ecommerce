/**
 * Correa a medida (Fase E-2). Cada color × material es un producto con una variante por
 * largo × mosquetón lado perro × mosquetón lado mano; cada variante es un inventory kit
 * (cuerda en metros + mosquetones + anillas + hebillas). Lo genera `correas:sync`
 * (`src/scripts/correas-sync.ts`) desde `catalog/<carpeta>/correas`.
 *
 * Aquí: las claves de metadata que comparten el script, el hook del carrito, la ruta de
 * disponibilidad y el storefront. Los datos que el cliente añade a la línea: lib/line-data.ts.
 */

/** `product.metadata.diseno` (Fase DS, lib/disenos.ts): el storefront pinta la ficha con el configurador. */
export const CORREA_DESIGN = "correa";
/** `product.metadata.grupo`: las correas salen como una sola tarjeta en listados y búsqueda. */
export const CORREA_GROUP = "correa";

/** Claves de `variant.metadata`. */
export const CORREA_VARIANT_META = {
  length: "largo_m",
  dogClip: "mosqueton_perro",
  handClip: "mosqueton_mano",
} as const;

/**
 * Producto de la correa a medida (ruta de disponibilidad de la landing): está en el grupo. El
 * hook del carrito no lo usa: valida por la variante (`variantLength`).
 */
export function isCorrea(metadata: Record<string, unknown> | null | undefined): boolean {
  return metadata?.grupo === CORREA_GROUP;
}

/** Largo de la variante (metros enteros) leído de su metadata. */
export function variantLength(metadata: Record<string, unknown> | null | undefined) {
  const v = metadata?.[CORREA_VARIANT_META.length];
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null;
}

// Datos de la línea (medida exacta, observaciones): lib/line-data.ts (Fase CS).
