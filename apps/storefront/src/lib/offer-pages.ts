// Páginas de /ofertas/ (I-Interficie). La server island de cada página recibe una CLAVE corta
// (`offersKey`) en vez de la lista de ids: las props de una island van cifradas en la URL y en
// el JS inline de la página (astro-docs, server islands § Caching: "pass only necessary props…
// avoid sending entire data objects and arrays"). Con ids, el inline crecía ~35 B gzip por
// producto; con la clave, es fijo.
// La clave es un hash del CONTENIDO de la página (sus ids): el HTML de un build anterior (p. ej.
// cacheado en la CDN tras un despliegue) trae una clave que el servidor nuevo no conoce → la
// island no corrige nada y se queda lo del build; nunca corrige tarjetas que no son las suyas.
// El reparto ids→página lo escribe en el build `src/pages/ofertas/paginas.json.ts`, y la
// integración `privateBuildManifests` (astro.config.mjs) lo mueve a dist/server (no público).
import { createHash } from "node:crypto";
import { PAGE_SIZE } from "./constants";

export interface OfferPage {
  key: string;
  ids: string[];
}

/** Clave de una página: 12 hex del sha256 de sus ids, en orden. */
export function offerPageKey(ids: readonly string[]): string {
  return createHash("sha256").update(ids.join(",")).digest("hex").slice(0, 12);
}

/** Reparte los ids en páginas de `size` (las mismas que `paginate()` de /ofertas/). */
export function offerPages(ids: readonly string[], size = PAGE_SIZE): OfferPage[] {
  const pages: OfferPage[] = [];
  for (let i = 0; i < ids.length; i += size) {
    const chunk = ids.slice(i, i + size);
    pages.push({ key: offerPageKey(chunk), ids: chunk });
  }
  return pages;
}

/** Manifiesto { clave: ids } (contenido de dist/server/offer-pages.json). */
export function offerPagesManifest(ids: readonly string[]): Record<string, string[]> {
  return Object.fromEntries(offerPages(ids).map((p) => [p.key, p.ids]));
}
