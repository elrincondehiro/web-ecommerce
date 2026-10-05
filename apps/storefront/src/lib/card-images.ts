// Lee el manifiesto de miniaturas del build una vez por proceso. Solo servidor (node:fs).
// Lo genera src/pages/buscar/tarjetas.json.ts en dist/client y la integración
// `privateCardImages` (astro.config.mjs) lo mueve a dist/server/card-images.json: NO es público.
// Ruta: igual que @astrojs/node 11.1.6 (shared.js resolveClientDir), se sube desde este módulo
// hasta la carpeta `server` del build. En `astro dev` no hay manifiesto: devuelve undefined y
// <ProductImage> usa <Picture> (en dev siempre va por /_image).
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CardImage } from "./images";

const MANIFEST = "card-images.json";

function findManifest(): string | null {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let prev = ""; dir !== prev; prev = dir, dir = dirname(dir)) {
    if (basename(dir) === "server") {
      const file = join(dir, MANIFEST);
      return existsSync(file) ? file : null;
    }
  }
  return null;
}

let cache: Map<string, CardImage> | undefined;
/** En producción, nunca undefined (sin manifiesto → mapa vacío → placeholders, nunca sharp). */
export function getCardImages(): Map<string, CardImage> | undefined {
  if (import.meta.env.DEV) return undefined;
  if (cache) return cache;
  const file = findManifest();
  try {
    cache = file
      ? new Map(Object.entries(JSON.parse(readFileSync(file, "utf8")) as Record<string, CardImage>))
      : new Map();
  } catch {
    cache = new Map();
  }
  return cache;
}
