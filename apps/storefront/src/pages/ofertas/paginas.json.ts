// Reparto ids → página de /ofertas/ (I-Interficie, lib/offer-pages.ts). Endpoint PRERENDERIZADO:
// el build lo escribe en dist/client/ofertas/paginas.json y la integración
// `privateBuildManifests` (astro.config.mjs) lo mueve a dist/server/offer-pages.json (NO
// público). Usa la misma lista que la página (getSaleProductIds, memorizada en el build).
// Fuente: astro-docs (guides/endpoints "Static File Endpoints").
import type { APIRoute } from "astro";
import { getSaleProducts } from "$lib/medusa";
import { offerPagesManifest } from "$lib/offer-pages";

export const prerender = true;

export const GET: APIRoute = async () => {
  const ids = (await getSaleProducts()).map((p) => p.id);
  return new Response(JSON.stringify(offerPagesManifest(ids)), {
    headers: { "Content-Type": "application/json" },
  });
};
