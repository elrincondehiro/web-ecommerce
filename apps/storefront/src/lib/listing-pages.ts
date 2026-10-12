// Manifiesto de páginas de LISTADO para LiveSync (Fase S, D-S1; generaliza el de /ofertas/ de
// I-Interficie). La server island de cada listado recibe una CLAVE corta (`pageKey`) en vez de
// la consulta (categoría + offset + limit) o la lista de ids:
//   - las props de una island van cifradas en la URL y en el JS inline de la página
//     (astro-docs, server islands § Caching: "pass only necessary props… avoid sending entire
//     data objects and arrays"): con la clave, el inline es fijo;
//   - la island ya no repite la consulta del build: con subcategorías (el padre agrega las
//     hijas; la Store API no incluye descendientes en `category_id`) o con otro orden, esa
//     consulta no daría los mismos productos. Por id, siempre corrige SUS tarjetas.
// La clave es un hash del CONTENIDO de la página (sus ids, en orden): el HTML de un build
// anterior (p. ej. cacheado en la CDN tras un despliegue) trae una clave que el servidor nuevo no
// conoce → la island devuelve "{}" y se queda lo del build.
// El reparto lo escribe en el build `src/pages/listados/paginas.json.ts` y la integración
// `privateBuildManifests` (astro.config.mjs) lo mueve a dist/server/listing-pages.json (no
// público). Solo servidor (node:crypto).
import { createHash } from "node:crypto";
import { PAGE_SIZE } from "./constants";

export const LISTING_PAGES_MANIFEST = "listing-pages.json";

export interface ListingPage {
  key: string;
  ids: string[];
}

/** Clave de una página: 12 hex del sha256 de sus ids, en orden. */
export function listingPageKey(ids: readonly string[]): string {
  return createHash("sha256").update(ids.join(",")).digest("hex").slice(0, 12);
}

/** Reparte los ids en páginas de `size` (las mismas que `paginate()`). */
export function listingPages(ids: readonly string[], size = PAGE_SIZE): ListingPage[] {
  const pages: ListingPage[] = [];
  for (let i = 0; i < ids.length; i += size) {
    const chunk = ids.slice(i, i + size);
    pages.push({ key: listingPageKey(chunk), ids: chunk });
  }
  return pages;
}

/**
 * Manifiesto { clave: ids } de varios listados. Cada listado se pagina por separado (`size`);
 * un bloque sin paginar (carrusel de la home) va como una sola página con `size = Infinity`.
 * Dos páginas con los mismos ids comparten clave (y contenido): sin conflicto.
 */
export function listingPagesManifest(
  listings: readonly { ids: readonly string[]; size?: number }[],
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const l of listings) {
    for (const p of listingPages(l.ids, l.size ?? PAGE_SIZE)) out[p.key] = p.ids;
  }
  return out;
}
