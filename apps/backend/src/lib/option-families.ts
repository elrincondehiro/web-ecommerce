/**
 * Familias de opciones (Fase FO): agrupar los valores de una opción para filtrar.
 *
 * Cada marca nombra sus colores (y a veces sus tallas) a su manera; con los nombres originales el
 * filtro se llena de valores con un producto. Una opción global puede declarar FAMILIAS y cada
 * valor pertenece a una o varias: los filtros enseñan las familias; la ficha y la búsqueda por
 * texto siguen con los nombres originales.
 *
 *   product_option.metadata.familias        = [{ id: "azul", nombre: "Azul", color: "#2f6fd1" }, …]
 *   product_option_value.metadata.familias  = ["verde", "azul"]
 *
 * Funciones PURAS y sin dependencias. ⚠️ Este fichero existe IGUAL en el backend
 * (apps/backend/src/lib/option-families.ts) y en el storefront
 * (apps/storefront/src/lib/option-families.ts): los tests comprueban que son idénticos. Cambia
 * los dos a la vez (copia uno sobre el otro).
 */

/** Clave de metadata en la opción (lista de familias) y en el valor (ids de sus familias). */
export const FAMILIES_KEY = "familias";

/** id de familia: va en la URL del filtro (`?familia=Color:azul`). */
export const FAMILY_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX_RE = /^#[0-9a-f]{6}$/i;
/** Topes (una lista de filtros manejable y una metadata pequeña). */
export const MAX_FAMILIES = 24;
export const MAX_FAMILIES_PER_VALUE = 4;
const MAX_NAME = 40;

export interface OptionFamily {
  id: string;
  nombre: string;
  /** Punto de color en el filtro (`#rrggbb`), o null (p. ej. tallas). */
  color: string | null;
}

/** Plantilla de color (aprobada el 1-nov-2026): rellena una opción nueva de un clic. */
export const COLOR_FAMILIES: readonly OptionFamily[] = [
  { id: "negro", nombre: "Negro", color: "#1f1f1f" },
  { id: "gris", nombre: "Gris", color: "#8a8f94" },
  { id: "blanco", nombre: "Blanco", color: "#f5f5f2" },
  { id: "marron-beige", nombre: "Marrón y beige", color: "#9a6b43" },
  { id: "rojo", nombre: "Rojo", color: "#c62828" },
  { id: "rosa", nombre: "Rosa", color: "#e889a8" },
  { id: "naranja", nombre: "Naranja", color: "#ef7d22" },
  { id: "amarillo", nombre: "Amarillo", color: "#f2c230" },
  { id: "verde", nombre: "Verde", color: "#3f9a55" },
  { id: "azul", nombre: "Azul", color: "#2f6fd1" },
  { id: "morado", nombre: "Morado", color: "#7b4fb0" },
  { id: "multicolor", nombre: "Multicolor", color: null },
];

type Metadata = Record<string, unknown> | null | undefined;
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Problema de una definición de familias (para el dry-run, el widget y los tests). */
export interface FamilyIssue {
  index: number;
  message: string;
}

/**
 * Lee y valida la lista de familias de una opción. Devuelve las válidas (en su orden, sin
 * repetidas) y los problemas encontrados. Sin metadata o lista vacía → [] (opción sin familias).
 */
export function parseOptionFamilies(metadata: Metadata): {
  families: OptionFamily[];
  issues: FamilyIssue[];
} {
  const raw = metadata?.[FAMILIES_KEY];
  const issues: FamilyIssue[] = [];
  if (raw === undefined || raw === null || raw === "") return { families: [], issues };
  if (!Array.isArray(raw)) {
    return { families: [], issues: [{ index: -1, message: "«familias» no es una lista" }] };
  }
  const families: OptionFamily[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of raw.entries()) {
    const issue = (message: string) => issues.push({ index, message });
    if (!isRecord(entry)) {
      issue("no es un objeto");
      continue;
    }
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    const nombre = typeof entry.nombre === "string" ? entry.nombre.trim() : "";
    const color = typeof entry.color === "string" ? entry.color.trim() : "";
    if (!FAMILY_ID_RE.test(id)) issue(`id «${id}» no válido`);
    else if (seen.has(id)) issue(`id «${id}» repetido`);
    else if (!nombre || nombre.length > MAX_NAME) {
      issue(`«${id}»: nombre vacío o de más de ${MAX_NAME}`);
    } else if (color && !HEX_RE.test(color)) issue(`«${id}»: color «${color}» no es #rrggbb`);
    else if (families.length >= MAX_FAMILIES) issue(`más de ${MAX_FAMILIES} familias`);
    else {
      seen.add(id);
      families.push({ id, nombre, color: color ? color.toLowerCase() : null });
    }
  }
  return { families, issues };
}

/** Familias de la opción (solo las válidas). */
export const optionFamilies = (metadata: Metadata) => parseOptionFamilies(metadata).families;

/**
 * Ids de familia de un valor, filtrados por las familias que existen en su opción (en el orden
 * de la opción, como mucho MAX_FAMILIES_PER_VALUE). Acepta lista o texto con `|` (como la hoja).
 * Sin familias en la opción → [].
 */
export function valueFamilies(
  valueMetadata: Metadata,
  families: readonly OptionFamily[],
): string[] {
  if (!families.length) return [];
  const raw = valueMetadata?.[FAMILIES_KEY];
  const ids = new Set(
    (Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split("|") : [])
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim()),
  );
  return families
    .filter((f) => ids.has(f.id))
    .map((f) => f.id)
    .slice(0, MAX_FAMILIES_PER_VALUE);
}

/** Texto de una celda de la hoja (`verde|azul`) → ids normalizados, sin repetir, en su orden. */
export function parseFamilyList(cell: string): string[] {
  return [
    ...new Set(
      cell
        .split("|")
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

/** Clave de filtro e índice: «Título:id» (mismo formato que `option_values`). */
export const familyKey = (optionTitle: string, familyId: string) => `${optionTitle}:${familyId}`;

/** Clave «Título:id» → partes, o null si no tiene el formato. */
export function splitFamilyKey(key: string): { title: string; id: string } | null {
  const i = key.lastIndexOf(":");
  if (i <= 0) return null;
  const id = key.slice(i + 1);
  return FAMILY_ID_RE.test(id) ? { title: key.slice(0, i), id } : null;
}

/** Opción de producto tal como la dan la Store API y `query.graph` (subconjunto). */
export interface FamilyOptionInput {
  title?: string | null;
  metadata?: Record<string, unknown> | null;
  values?: ({ value?: string | null; metadata?: Record<string, unknown> | null } | null)[] | null;
}

/**
 * Claves de familia de un producto («Color:azul», «Talla:m»), para el índice y los filtros del
 * build: las de los valores de sus opciones con familias. Sin repetidas, en orden estable.
 */
export function productFamilyKeys(
  options: readonly (FamilyOptionInput | null)[] | null | undefined,
) {
  const keys = new Set<string>();
  for (const option of options ?? []) {
    const title = option?.title?.trim();
    if (!title) continue;
    const families = optionFamilies(option?.metadata);
    if (!families.length) continue;
    for (const value of option?.values ?? []) {
      for (const id of valueFamilies(value?.metadata, families)) keys.add(familyKey(title, id));
    }
  }
  return [...keys];
}

/** Valores de una opción con familias que no tienen ninguna (no saldrían en el filtro). */
export function valuesWithoutFamily(option: FamilyOptionInput | null | undefined): string[] {
  const families = optionFamilies(option?.metadata);
  if (!families.length) return [];
  return (option?.values ?? [])
    .filter((v) => v?.value && !valueFamilies(v.metadata, families).length)
    .map((v) => v!.value!);
}
