// Datos del sitemap que la integración @astrojs/sitemap no puede sacar de las páginas (Fase E):
// `lastmod` de cada ficha (`updated_at` de Medusa) y las fichas que NO van al sitemap
// (descatalogadas, `noindex`). Endpoint PRERENDERIZADO: la integración `sitemapData`
// (astro.config.mjs) lo lee al terminar el build, antes de que se escriba el sitemap, y luego se
// borra (no es público). Fuente: astro-docs (integrations-guide/sitemap#serialize).
import type { APIRoute } from "astro";
import { isDiscontinued } from "$lib/catalog";
import { getAllProducts } from "$lib/medusa";

export const prerender = true;

export const GET: APIRoute = async () => {
  const lastmod: Record<string, string> = {};
  const exclude: string[] = [];
  for (const p of await getAllProducts()) {
    const path = `/producto/${p.handle}/`;
    if (isDiscontinued(p)) exclude.push(path);
    else if (p.updated_at) lastmod[path] = new Date(p.updated_at).toISOString();
  }
  return new Response(JSON.stringify({ lastmod, exclude }), {
    headers: { "Content-Type": "application/json" },
  });
};
