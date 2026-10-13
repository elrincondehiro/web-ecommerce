/**
 * Productos descatalogados (Fase E, docs/fases/faseE-urls-correas.md §E-1, opción i): siguen
 * publicados para que su URL no dé 404, pero no se listan, no se buscan y no se pueden comprar.
 * Lo marca `catalog:import` (columna `descatalogado`) en `product.metadata.descatalogado`.
 */
export const DISCONTINUED_KEY = "descatalogado";

export function isDiscontinued(metadata: Record<string, unknown> | null | undefined): boolean {
  return metadata?.[DISCONTINUED_KEY] === true;
}

export const DISCONTINUED_MESSAGE = "Este producto está descatalogado y ya no se puede comprar.";
