/**
 * Convención de nombres de fotos de producto (fase 6): `<handle>_<XX>.jpg|jpeg`
 *   - `<handle>`: handle del producto en Medusa (minúsculas, dígitos y guiones).
 *   - `<XX>`: dos dígitos 01–99; define el orden. `_01` es la miniatura.
 * Fotos de un valor de opción (Fase O): `<handle>--<valor>_<XX>.jpg`, con el valor de la opción
 * `metadata.opcion_fotos` del producto en minúsculas, sin tildes y con guiones (`valueSlug`):
 * se asocian a las variantes con ese valor. Van detrás de las generales.
 * Funciones puras (sin I/O) para poder testearlas.
 */
import path from "node:path";

export interface ParsedImageFile {
  file: string;
  handle: string;
  /** Fase O: slug del valor de opción (`--flores`), o null en las fotos generales. */
  value: string | null;
  position: number;
}

export interface ProductImagePlan {
  handle: string;
  files: ParsedImageFile[];
}

export const IMAGE_FILE_RE =
  /^([a-z0-9]+(?:-[a-z0-9]+)*?)(?:--([a-z0-9]+(?:-[a-z0-9]+)*))?_(\d{2})\.(jpe?g)$/;

/** Valor de opción → parte del nombre de fichero: «Rayas Azules» → `rayas-azules`. */
export const valueSlug = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

/** Analiza un nombre de fichero. `null` si no sigue la convención o la posición es 00. */
export function parseImageFileName(file: string): ParsedImageFile | null {
  const match = IMAGE_FILE_RE.exec(path.basename(file).toLowerCase());
  if (!match) return null;
  const position = Number(match[3]);
  if (position < 1) return null;
  return { file, handle: match[1] as string, value: match[2] ?? null, position };
}

/**
 * Agrupa ficheros por handle y los ordena: generales por posición y después las de cada valor
 * (alfabético) por posición. Devuelve también los nombres
 * ignorados (no siguen la convención) y los duplicados (misma posición con .jpg y .jpeg).
 */
export function planProductImages(files: string[]): {
  products: ProductImagePlan[];
  ignored: string[];
  duplicates: string[];
} {
  const byHandle = new Map<string, Map<string, ParsedImageFile>>();
  const ignored: string[] = [];
  const duplicates: string[] = [];
  for (const file of files) {
    const parsed = parseImageFileName(file);
    if (!parsed) {
      ignored.push(file);
      continue;
    }
    const positions = byHandle.get(parsed.handle) ?? new Map<string, ParsedImageFile>();
    const key = `${parsed.value ?? ""}_${parsed.position}`;
    if (positions.has(key)) {
      duplicates.push(file);
      continue;
    }
    positions.set(key, parsed);
    byHandle.set(parsed.handle, positions);
  }
  const products = [...byHandle.entries()]
    .map(([handle, positions]) => ({
      handle,
      files: [...positions.values()].sort(
        (a, b) =>
          Number(a.value !== null) - Number(b.value !== null) ||
          (a.value ?? "").localeCompare(b.value ?? "") ||
          a.position - b.position,
      ),
    }))
    .sort((a, b) => a.handle.localeCompare(b.handle));
  return { products, ignored, duplicates };
}

/**
 * Nombre original a partir de la URL que genera `file-s3`: `<prefix><nombre>-<ULID><ext>`.
 * Respaldo de `metadata.source_file`, que se pierde si el Admin vuelve a guardar las imágenes
 * del producto (Medusa las recrea sin metadata). Devuelve null si no sigue la convención.
 */
const S3_KEY_RE = /^(.+)-[0-9A-HJKMNP-TV-Z]{26}(\.[a-z0-9]+)$/i;
export function sourceFileFromUrl(url: string): string | null {
  const base = decodeURIComponent(url.split("?")[0]?.split("/").pop() ?? "");
  const m = S3_KEY_RE.exec(base);
  if (!m) return null;
  const file = `${m[1]}${m[2]}`.toLowerCase();
  return parseImageFileName(file) ? file : null;
}
