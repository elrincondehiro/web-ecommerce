/**
 * Nombres de las fotos del catálogo (los mismos que acepta `images:import`, backend
 * src/scripts/lib/image-files.ts). Funciones puras: tests en nombres.test.ts.
 *   - `<handle>_<XX>.jpg`               foto general (01 = miniatura)
 *   - `<handle>--<valor>_<XX>.jpg`      foto de un valor de opción (Fase O)
 *   - `<handle>--<valor>_muestra.png`   muestra del valor en el selector (transparente)
 * Se aceptan de entrada .jpg/.jpeg/.png/.webp/.tif/.tiff/.heic: la salida siempre es JPG (fotos)
 * o PNG (muestras).
 */
export type Kind = "foto" | "muestra";

export interface Planned {
  /** Fichero de entrada (tal cual). */
  input: string;
  /** Nombre de salida, o null si no sigue la convención. */
  output: string | null;
  kind: Kind | null;
}

const HANDLE = "[a-z0-9]+(?:-[a-z0-9]+)*?";
const VALUE = "[a-z0-9]+(?:-[a-z0-9]+)*";
const EXT = "(?:jpe?g|png|webp|tiff?|heic)";
const PHOTO = new RegExp(`^(${HANDLE})(?:--(${VALUE}))?_(\\d{2})\\.${EXT}$`);
const SWATCH = new RegExp(`^(${HANDLE})--(${VALUE})_muestra\\.${EXT}$`);

export function plan(file: string): Planned {
  const name = file.toLowerCase();
  const sw = SWATCH.exec(name);
  if (sw) return { input: file, output: `${sw[1]}--${sw[2]}_muestra.png`, kind: "muestra" };
  const ph = PHOTO.exec(name);
  if (ph && Number(ph[3]) >= 1) {
    const value = ph[2] ? `--${ph[2]}` : "";
    return { input: file, output: `${ph[1]}${value}_${ph[3]}.jpg`, kind: "foto" };
  }
  return { input: file, output: null, kind: null };
}

/** Dos entradas que dan la misma salida (p. ej. `a_01.jpg` y `a_01.png`). */
export function collisions(items: Planned[]): string[] {
  const seen = new Map<string, string>();
  const out: string[] = [];
  for (const i of items) {
    if (!i.output) continue;
    const prev = seen.get(i.output);
    if (prev) out.push(`${prev} y ${i.input} → ${i.output}`);
    else seen.set(i.output, i.input);
  }
  return out;
}

/** ¿Hace falta avisar de que no es cuadrada? La tienda recorta al centro en 1:1. */
export const notSquare = (w: number, h: number, tolerance = 0.02) =>
  Math.abs(w - h) / Math.max(w, h) > tolerance;
