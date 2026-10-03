/**
 * Convención de nombres de fotos de producto (fase 6): `<handle>_<XX>.jpg|jpeg`
 *   - `<handle>`: handle del producto en Medusa (minúsculas, dígitos y guiones).
 *   - `<XX>`: dos dígitos 01–99; define el orden. `_01` es la miniatura.
 * Funciones puras (sin I/O) para poder testearlas.
 */
import path from "node:path";

export interface ParsedImageFile {
  file: string;
  handle: string;
  position: number;
}

export interface ProductImagePlan {
  handle: string;
  files: ParsedImageFile[];
}

export const IMAGE_FILE_RE = /^([a-z0-9]+(?:-[a-z0-9]+)*)_(\d{2})\.(jpe?g)$/;

export const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

/** Analiza un nombre de fichero. `null` si no sigue la convención o la posición es 00. */
export function parseImageFileName(file: string): ParsedImageFile | null {
  const match = IMAGE_FILE_RE.exec(path.basename(file).toLowerCase());
  if (!match) return null;
  const position = Number(match[2]);
  if (position < 1) return null;
  return { file, handle: match[1] as string, position };
}

/**
 * Agrupa ficheros por handle y los ordena por posición. Devuelve también los nombres
 * ignorados (no siguen la convención) y los duplicados (misma posición con .jpg y .jpeg).
 */
export function planProductImages(files: string[]): {
  products: ProductImagePlan[];
  ignored: string[];
  duplicates: string[];
} {
  const byHandle = new Map<string, Map<number, ParsedImageFile>>();
  const ignored: string[] = [];
  const duplicates: string[] = [];
  for (const file of files) {
    const parsed = parseImageFileName(file);
    if (!parsed) {
      ignored.push(file);
      continue;
    }
    const positions = byHandle.get(parsed.handle) ?? new Map<number, ParsedImageFile>();
    if (positions.has(parsed.position)) {
      duplicates.push(file);
      continue;
    }
    positions.set(parsed.position, parsed);
    byHandle.set(parsed.handle, positions);
  }
  const products = [...byHandle.entries()]
    .map(([handle, positions]) => ({
      handle,
      files: [...positions.values()].sort((a, b) => a.position - b.position),
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
