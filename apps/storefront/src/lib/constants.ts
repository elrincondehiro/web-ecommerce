export const PAGE_SIZE = 24;
export const SITE_NAME = "El Rincón de Hiro";
export const OFFERS_PATH = "/ofertas/";

/**
 * Interruptores de catálogo (Fase S, S-2). Cambiar aquí = rebuild; afectan a las páginas
 * estáticas, a /buscar/ (runtime) y a la island de LiveSync.
 * - unitPriceInCards: €/kg o €/l en las tarjetas de los listados (la ficha lo muestra siempre;
 *   RD 3423/2000: precio por unidad de medida donde se anuncia el precio).
 * - dryMatterColumn: columna «Materia seca» en la tabla de componentes analíticos de la ficha.
 * - dryMatterFilters: filtros de proteína y grasa sobre materia seca en /buscar/ y «Filtrar».
 */
export const CATALOG_FEATURES = {
  unitPriceInCards: true,
  dryMatterColumn: true,
  dryMatterFilters: true,
} as const;
