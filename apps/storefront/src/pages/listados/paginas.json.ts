// Manifiesto de páginas de LISTADO para LiveSync (Fase S, D-S1; lib/listing-pages.ts): clave →
// ids de cada página de categoría (con su subárbol), /productos/, /ofertas/ y el carrusel de la
// home. Endpoint PRERENDERIZADO: el build lo escribe en dist/client/listados/paginas.json y la
// integración `privateBuildManifests` (astro.config.mjs) lo mueve a
// dist/server/listing-pages.json (NO público). Mismos datos que las páginas (catálogo memorizado).
// Fuente: astro-docs (guides/endpoints "Static File Endpoints").
import type { APIRoute } from "astro";
import { buildListingManifest } from "$lib/shop";

export const prerender = true;

export const GET: APIRoute = async () =>
  new Response(JSON.stringify(await buildListingManifest()), {
    headers: { "Content-Type": "application/json" },
  });
