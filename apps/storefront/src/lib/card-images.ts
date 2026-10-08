// Manifiesto de miniaturas del build para /buscar/ (fase 7-1, D6). Lo genera
// src/pages/buscar/tarjetas.json.ts y se lee de dist/server/card-images.json (lib/build-manifest).
// En `astro dev` no hay manifiesto: devuelve undefined y <ProductImage> usa <Picture> (en dev
// siempre va por /_image).
import { readBuildManifest } from "./build-manifest";
import type { CardImage } from "./images";

/** En producción, nunca undefined (sin manifiesto → mapa vacío → placeholders, nunca sharp). */
export function getCardImages(): Map<string, CardImage> | undefined {
  if (import.meta.env.DEV) return undefined;
  return readBuildManifest<CardImage>("card-images.json");
}
