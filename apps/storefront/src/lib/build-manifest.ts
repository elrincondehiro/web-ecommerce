// Lee un manifiesto JSON del build desde dist/server (NO público), una vez por proceso. Solo
// servidor (node:fs). Los generan endpoints prerenderizados en dist/client y la integración
// `privateBuildManifests` (astro.config.mjs) los mueve a dist/server:
//   card-images.json (miniaturas de /buscar/, fase 7-1) · offer-pages.json (/ofertas/, I-Interficie).
// Ruta: igual que @astrojs/node 11.1.6 (shared.js resolveClientDir), se sube desde este módulo
// hasta la carpeta `server` del build.
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function findManifest(name: string): string | null {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let prev = ""; dir !== prev; prev = dir, dir = dirname(dir)) {
    if (basename(dir) === "server") {
      const file = join(dir, name);
      return existsSync(file) ? file : null;
    }
  }
  return null;
}

const cache = new Map<string, Map<string, unknown>>();

/** Contenido del manifiesto como mapa; vacío si no existe o no se puede leer. */
export function readBuildManifest<T>(name: string): Map<string, T> {
  const hit = cache.get(name);
  if (hit) return hit as Map<string, T>;
  let map = new Map<string, T>();
  const file = findManifest(name);
  try {
    if (file)
      map = new Map(Object.entries(JSON.parse(readFileSync(file, "utf8")) as Record<string, T>));
  } catch {
    // corrupto o ilegible: como si no existiera
  }
  cache.set(name, map);
  return map;
}
