// Home (Fase H): orden de los bloques y categorías destacadas. Funciones PURAS (las usa
// src/pages/index.astro en el build y los tests). La validación del yaml (obligatorios, tipos)
// la hace el esquema de content.config.ts; aquí, lo que el esquema no puede comprobar.

/** Bloques ordenables de la home (el hero va siempre el primero, fuera de esta lista). */
export const HOME_BLOCKS = [
  "categorias",
  "destacados",
  "novedades",
  "colecciones",
  "ofertas",
  "etiquetas",
  "valores",
] as const;
export type HomeBlock = (typeof HOME_BLOCKS)[number];

type WithOrden = { orden: number } | undefined;

/**
 * Bloques presentes en el yaml, de menor a mayor `orden`. Dos bloques con el mismo orden lanzan
 * un error (el build falla): el orden del yaml tiene que ser inequívoco.
 */
export function orderedBlocks(data: Partial<Record<HomeBlock, WithOrden>>): HomeBlock[] {
  const present = HOME_BLOCKS.filter((b) => data[b]);
  const seen = new Map<number, HomeBlock>();
  for (const b of present) {
    const o = data[b]!.orden;
    const other = seen.get(o);
    if (other) throw new Error(`home.yaml: «${other}» y «${b}» tienen el mismo orden (${o}).`);
    seen.set(o, b);
  }
  return present.sort((a, b) => data[a]!.orden - data[b]!.orden);
}

/**
 * Categorías destacadas: las de `handles` que existen en el árbol de la tienda (solo tiene las
 * que tienen productos), en el orden del yaml y sin repetir. `missing` = las que se omiten (el
 * build lo avisa). Sin ninguna válida lanza un error: la home no puede quedarse sin categorías.
 */
export function featuredCategories<T>(
  handles: readonly string[],
  byHandle: ReadonlyMap<string, T>,
): { categories: T[]; missing: string[] } {
  const categories: T[] = [];
  const missing: string[] = [];
  for (const h of new Set(handles)) {
    const node = byHandle.get(h);
    if (node) categories.push(node);
    else missing.push(h);
  }
  if (!categories.length) {
    throw new Error(
      `home.yaml: ninguna de las categorías destacadas existe con productos (${handles.join(", ")}).`,
    );
  }
  return { categories, missing };
}

// ── Novedades (Fase H, c) ──────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
/** Etiqueta de Medusa que marca un producto como novedad a mano, sin importar su fecha. */
export const NEW_TAG = "novedad";

export interface NewnessRule {
  /** Días desde el alta en los que un producto cuenta como novedad. */
  dias: number;
  /**
   * Fecha de corte (YYYY-MM-DD): los productos creados ANTES no cuentan por fecha (la carga
   * inicial del catálogo saldría entera como novedad). Sí con la etiqueta.
   */
  desde?: string | undefined;
}

type NewnessProduct = {
  created_at?: string | Date | null;
  tags?: ({ value?: string | null } | null)[] | null;
};

const hasNewTag = (p: NewnessProduct) =>
  (p.tags ?? []).some((t) => t?.value?.trim().toLowerCase() === NEW_TAG);

/** ¿Es novedad? Creado en los últimos `dias` (y no antes de `desde`) o con la etiqueta. */
export function isNew(p: NewnessProduct, rule: NewnessRule, now: Date): boolean {
  if (hasNewTag(p)) return true;
  if (!p.created_at) return false;
  const created = new Date(p.created_at).getTime();
  if (Number.isNaN(created)) return false;
  if (rule.desde && created < new Date(`${rule.desde}T00:00:00Z`).getTime()) return false;
  return created >= now.getTime() - rule.dias * DAY_MS;
}

/**
 * Novedades: las que cumplen `isNew`, de la más reciente a la más antigua (las de solo etiqueta,
 * por su fecha también). Orden estable para el mismo build.
 */
export function newProducts<T extends NewnessProduct>(
  products: readonly T[],
  rule: NewnessRule,
  now: Date,
): T[] {
  const time = (p: T) => (p.created_at ? new Date(p.created_at).getTime() : 0) || 0;
  return products.filter((p) => isNew(p, rule, now)).sort((a, b) => time(b) - time(a));
}

// ── Chips de etiquetas (Fase H, d) ─────────────────────────────────────────────────────────

/**
 * Etiquetas del yaml que tienen algún producto (con su número), en el orden del yaml y sin
 * repetir. Las que no tienen productos se omiten (un chip a una búsqueda vacía no sirve).
 */
export function tagChips(
  wanted: readonly string[],
  products: readonly { tags?: ({ value?: string | null } | null)[] | null }[],
): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of products) {
    for (const v of new Set((p.tags ?? []).map((t) => t?.value).filter(Boolean) as string[])) {
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
  }
  return [...new Set(wanted)]
    .map((value) => ({ value, count: counts.get(value) ?? 0 }))
    .filter((c) => c.count > 0);
}
