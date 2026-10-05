// Búsqueda (fase 7-1): funciones PURAS (sin astro:* ni I/O) para testearlas con Vitest.
// La URL es el estado: parseSearchParams ↔ toSearchString. La llamada a Medusa está en
// lib/medusa.ts (searchProducts) y la página en src/pages/buscar/.
// Fuente: código de @medusajs/medusa 2.21.2 (api/store/search/validators.js: forma del body,
// `queries` ≤ 20, `take` ≤ 100) y @medusajs/search 2.21.2 (utils/index.js: las facetas
// disyuntivas quitan TODOS los filtros del campo facetado). Ver docs/fases/fase7.md §2.3.
import { z } from "astro/zod";
import { PAGE_SIZE } from "./constants";

export const SEARCH_PATH = "/buscar/";

export const SORTS = ["relevancia", "precio-asc", "precio-desc", "novedades"] as const;
export type Sort = (typeof SORTS)[number];
export const SORT_LABELS: Record<Sort, string> = {
  relevancia: "Relevancia",
  "precio-asc": "Precio: de menor a mayor",
  "precio-desc": "Precio: de mayor a menor",
  novedades: "Novedades",
};

/** Límites: la URL no puede crecer sin control (caché, coste de la consulta). */
const MAX_Q = 100;
const MAX_VALUES = 20;
const MAX_VALUE_LENGTH = 80;
const MAX_PAGE = 100;

export interface SearchParams {
  q: string;
  categoria: string[];
  etiqueta: string[];
  /** `"Título:valor"`, igual que `option_values` en el índice. */
  opcion: string[];
  precioMin: number | null;
  precioMax: number | null;
  disponible: boolean;
  orden: Sort;
  pagina: number;
}

export type MultiKey = "categoria" | "etiqueta" | "opcion";

// eslint-disable-next-line no-control-regex -- se quitan caracteres de control a propósito
const CONTROL = /[\u0000-\u001f\u007f]/g;
const cleanText = (v: string) => v.replace(CONTROL, "").replace(/\s+/g, " ").trim();

const handleSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(MAX_VALUE_LENGTH);
const optionSchema = z
  .string()
  .max(MAX_VALUE_LENGTH)
  .refine((v) => /^[^:]+:.+$/.test(v));
const priceSchema = z.coerce.number().min(0).max(1_000_000);
const pageSchema = z.coerce.number().int().min(1).max(MAX_PAGE);

/** Valores válidos, sin repetir y ORDENADOS (misma URL canónica para el mismo filtro). */
function multi(values: string[], schema: z.ZodType<string>): string[] {
  const ok = new Set<string>();
  for (const raw of values) {
    const v = cleanText(raw);
    if (v && schema.safeParse(v).success) ok.add(v);
  }
  return [...ok].sort((a, b) => a.localeCompare(b, "es")).slice(0, MAX_VALUES);
}

function price(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") return null;
  const parsed = priceSchema.safeParse(raw.replace(",", "."));
  return parsed.success ? Math.round(parsed.data * 100) / 100 : null;
}

/** Lee y normaliza los parámetros de `/buscar/`. Lo desconocido o inválido se descarta. */
export function parseSearchParams(search: URLSearchParams): SearchParams {
  let precioMin = price(search.get("precio_min"));
  let precioMax = price(search.get("precio_max"));
  if (precioMin !== null && precioMax !== null && precioMin > precioMax) {
    [precioMin, precioMax] = [precioMax, precioMin];
  }
  const orden = search.get("orden");
  const pagina = pageSchema.safeParse(search.get("pagina") ?? "1");
  return {
    q: cleanText(search.get("q") ?? "").slice(0, MAX_Q),
    categoria: multi(search.getAll("categoria"), handleSchema),
    etiqueta: multi(search.getAll("etiqueta"), z.string().min(1).max(MAX_VALUE_LENGTH)),
    opcion: multi(search.getAll("opcion"), optionSchema),
    precioMin,
    precioMax,
    disponible: search.get("disponible") === "1",
    orden: (SORTS as readonly string[]).includes(orden ?? "") ? (orden as Sort) : "relevancia",
    pagina: pagina.success ? pagina.data : 1,
  };
}

/** Query string canónica (orden fijo de claves, sin valores por defecto). Sin `?`. */
export function toSearchString(p: SearchParams): string {
  const s = new URLSearchParams();
  if (p.q) s.set("q", p.q);
  for (const v of p.categoria) s.append("categoria", v);
  for (const v of p.etiqueta) s.append("etiqueta", v);
  for (const v of p.opcion) s.append("opcion", v);
  if (p.precioMin !== null) s.set("precio_min", String(p.precioMin));
  if (p.precioMax !== null) s.set("precio_max", String(p.precioMax));
  if (p.disponible) s.set("disponible", "1");
  if (p.orden !== "relevancia") s.set("orden", p.orden);
  if (p.pagina > 1) s.set("pagina", String(p.pagina));
  return s.toString();
}

/** Pares nombre/valor de la URL canónica (para `<input type="hidden">`). */
export function paramEntries(p: SearchParams, omit: string[] = []): [string, string][] {
  return [...new URLSearchParams(toSearchString(p))].filter(([k]) => !omit.includes(k));
}

export function searchUrl(p: SearchParams, path = SEARCH_PATH): string {
  const qs = toSearchString(p);
  return qs ? `${path}?${qs}` : path;
}

/** Cambiar un filtro siempre vuelve a la página 1. */
const reset = (p: SearchParams): SearchParams => ({ ...p, pagina: 1 });

/** Enlace que marca o desmarca un valor de un filtro múltiple. */
export function toggleUrl(p: SearchParams, key: MultiKey, value: string, path?: string): string {
  const has = p[key].includes(value);
  const next = has ? p[key].filter((v) => v !== value) : [...p[key], value];
  const parsed = parseSearchParams(new URLSearchParams(toSearchString({ ...p, [key]: next })));
  return searchUrl(reset({ ...parsed, orden: p.orden }), path);
}

export type ActiveFilter = { label: string; href: string };

/** Filtros fijos de una página (p. ej. la categoría de un listado): ni chip ni "quitar". */
export interface FixedFilters {
  categoria?: string | undefined;
}

/** Chips de filtros aplicados: cada uno es un enlace que quita ese filtro. */
export function activeFilters(
  p: SearchParams,
  opts: {
    categoria?: (handle: string) => string;
    path?: string | undefined;
    fixed?: FixedFilters | undefined;
  } = {},
): ActiveFilter[] {
  const { path, fixed = {} } = opts;
  const out: ActiveFilter[] = [];
  for (const v of p.categoria) {
    if (v === fixed.categoria) continue;
    out.push({ label: opts.categoria?.(v) ?? v, href: toggleUrl(p, "categoria", v, path) });
  }
  for (const v of p.opcion) {
    const { title, value } = splitOption(v);
    out.push({ label: `${title}: ${value}`, href: toggleUrl(p, "opcion", v, path) });
  }
  for (const v of p.etiqueta) out.push({ label: v, href: toggleUrl(p, "etiqueta", v, path) });
  if (p.precioMin !== null || p.precioMax !== null) {
    out.push({
      label: priceLabel(p.precioMin, p.precioMax),
      href: searchUrl(reset({ ...p, precioMin: null, precioMax: null }), path),
    });
  }
  if (p.disponible) {
    out.push({ label: "Disponible", href: searchUrl(reset({ ...p, disponible: false }), path) });
  }
  return out;
}

/** Quitar todos los filtros (se mantienen el texto, el orden y los filtros fijos). */
export function clearFiltersUrl(p: SearchParams, path?: string, fixed: FixedFilters = {}): string {
  return searchUrl(
    {
      ...emptyParams(),
      q: p.q,
      orden: p.orden,
      categoria: fixed.categoria ? [fixed.categoria] : [],
    },
    path,
  );
}

export function emptyParams(): SearchParams {
  return parseSearchParams(new URLSearchParams());
}

export function hasFilters(p: SearchParams, fixed: FixedFilters = {}): boolean {
  const categorias = p.categoria.filter((c) => c !== fixed.categoria).length;
  return (
    categorias + p.etiqueta.length + p.opcion.length > 0 ||
    p.precioMin !== null ||
    p.precioMax !== null ||
    p.disponible
  );
}

/** Nº de filtros elegidos (para "Filtrar (3)"); el precio cuenta como uno. */
export function selectedCount(p: SearchParams, fixed: FixedFilters = {}): number {
  return (
    p.etiqueta.length +
    p.opcion.length +
    p.categoria.filter((c) => c !== fixed.categoria).length +
    (p.precioMin !== null || p.precioMax !== null ? 1 : 0) +
    (p.disponible ? 1 : 0)
  );
}

export function splitOption(v: string): { title: string; value: string } {
  const i = v.indexOf(":");
  return { title: v.slice(0, i), value: v.slice(i + 1) };
}

function priceLabel(min: number | null, max: number | null): string {
  const f = (n: number) => `${n.toLocaleString("es-ES", { maximumFractionDigits: 2 })} €`;
  if (min !== null && max !== null) return `${f(min)} – ${f(max)}`;
  if (min !== null) return `Desde ${f(min)}`;
  return `Hasta ${f(max!)}`;
}

// ── Cuerpo de POST /store/search ──────────────────────────────────────────────────────────

type Filter = Record<string, unknown>;
export interface SearchQueryBody {
  entity: "product";
  fields: string[];
  filters: Filter;
  pagination: { skip: number; take: number; order?: Record<string, "ASC" | "DESC"> };
  search_options: {
    facets: (string | { field: string; type?: string })[];
    disjunctive_facets?: boolean;
  };
}

export const FACET_FIELDS = ["category_handles", "tags", "option_values", "in_stock"] as const;
const PRICE_FACET = { field: "min_price_eur", type: "stats" } as const;

/** Opciones marcadas agrupadas por título: dentro de un grupo OR, entre grupos AND. */
export function optionGroups(opcion: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const v of opcion) {
    const { title } = splitOption(v);
    groups.set(title, [...(groups.get(title) ?? []), v]);
  }
  return groups;
}

function filtersFor(p: SearchParams, skipOptionGroup?: string): Filter {
  const and: Filter[] = [];
  if (p.categoria.length) and.push({ category_handles: { $in: p.categoria } });
  if (p.etiqueta.length) and.push({ tags: { $in: p.etiqueta } });
  for (const [title, values] of optionGroups(p.opcion)) {
    if (title !== skipOptionGroup) and.push({ option_values: { $in: values } });
  }
  // Rango que se solapa con [min, max] de las variantes: alguna variante cae en el rango.
  if (p.precioMin !== null) and.push({ max_price_eur: { $gte: p.precioMin } });
  if (p.precioMax !== null) and.push({ min_price_eur: { $lte: p.precioMax } });
  if (p.disponible) and.push({ in_stock: true });
  return { ...(p.q ? { q: p.q } : {}), ...(and.length ? { $and: and } : {}) };
}

function orderFor(p: SearchParams): Record<string, "ASC" | "DESC"> | undefined {
  switch (p.orden) {
    case "precio-asc":
      return { min_price_eur: "ASC" };
    case "precio-desc":
      return { min_price_eur: "DESC" };
    case "novedades":
      return { created_at: "DESC" };
    default:
      // Sin texto no hay relevancia: mismo orden que el catálogo.
      return p.q ? undefined : { title: "ASC" };
  }
}

/**
 * Consultas para una página de resultados:
 * - [0] resultados + facetas disyuntivas (Medusa quita el filtro de cada campo al contarlo);
 * - [1..] una por grupo de opciones marcado (Talla, Color…): `option_values` es UN campo, así
 *   que Medusa quitaría TODOS los grupos; aquí se quita solo el propio para contar bien.
 * NO se envía `typo_tolerance`: Meilisearch lo configura por índice y rechaza la opción.
 */
export function buildSearchQueries(p: SearchParams, take = PAGE_SIZE): SearchQueryBody[] {
  const main: SearchQueryBody = {
    entity: "product",
    fields: ["id"],
    filters: filtersFor(p),
    pagination: {
      skip: (p.pagina - 1) * take,
      take,
      ...(orderFor(p) ? { order: orderFor(p)! } : {}),
    },
    search_options: { facets: [...FACET_FIELDS, PRICE_FACET], disjunctive_facets: true },
  };
  const groups = [...optionGroups(p.opcion).keys()];
  const perGroup = groups.length > 1 ? groups : [];
  return [
    main,
    ...perGroup.map((title): SearchQueryBody => ({
      entity: "product",
      fields: ["id"],
      filters: filtersFor(p, title),
      pagination: { skip: 0, take: 0 },
      search_options: { facets: ["option_values"] },
    })),
  ];
}

// ── Respuesta ────────────────────────────────────────────────────────────────────────────

export interface FacetValue {
  value: string;
  count: number;
}
interface RawFacet {
  type?: string;
  values?: FacetValue[];
  min?: number;
  max?: number;
}
export interface RawSearchResult {
  hits?: { id: string }[];
  metadata?: { count?: number };
  facets?: Record<string, RawFacet>;
}

export interface SearchOutcome {
  ids: string[];
  total: number;
  facets: {
    categoria: FacetValue[];
    etiqueta: FacetValue[];
    opcion: FacetValue[];
    disponible: number;
    price: { min: number; max: number } | null;
  };
}

/** Une la consulta principal y las de cada grupo de opciones (§ buildSearchQueries). */
export function parseSearchResults(p: SearchParams, results: RawSearchResult[]): SearchOutcome {
  const [main, ...rest] = results;
  const facets = main?.facets ?? {};
  let opcion = facets.option_values?.values ?? [];
  const groups = [...optionGroups(p.opcion).keys()];
  if (groups.length > 1) {
    const counted = new Set(groups);
    opcion = opcion.filter((f) => !counted.has(splitOption(f.value).title));
    groups.forEach((title, i) => {
      const own = (rest[i]?.facets?.option_values?.values ?? []).filter(
        (f) => splitOption(f.value).title === title,
      );
      opcion = [...opcion, ...own];
    });
  }
  const stats = facets.min_price_eur;
  return {
    ids: (main?.hits ?? []).map((h) => h.id),
    total: main?.metadata?.count ?? 0,
    facets: {
      categoria: facets.category_handles?.values ?? [],
      etiqueta: facets.tags?.values ?? [],
      opcion,
      disponible: facets.in_stock?.values?.find((v) => v.value === "true")?.count ?? 0,
      price:
        typeof stats?.min === "number" && typeof stats.max === "number"
          ? { min: stats.min, max: stats.max }
          : null,
    },
  };
}

export function lastPage(total: number, take = PAGE_SIZE): number {
  return Math.max(1, Math.min(MAX_PAGE, Math.ceil(total / take)));
}
