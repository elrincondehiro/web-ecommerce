// Árbol de categorías de la tienda (sin las vacías) tal como se construyó (Fase S, S-1):
// lo leen en runtime la cabecera de las páginas on-demand, /buscar/ y las sugerencias
// (lib/shop.ts), así sus enlaces coinciden con las páginas que existen. Endpoint PRERENDERIZADO
// → dist/server/shop-categories.json (no público; `privateBuildManifests`, astro.config.mjs).
import type { APIRoute } from "astro";
import { getShopTree, shopCategoriesManifest } from "$lib/shop";

export const prerender = true;

export const GET: APIRoute = async () =>
  new Response(JSON.stringify(shopCategoriesManifest(await getShopTree(true))), {
    headers: { "Content-Type": "application/json" },
  });
