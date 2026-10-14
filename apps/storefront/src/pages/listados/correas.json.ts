// Manifiesto de las tarjetas de correa a medida (Fase E-2c; lib/correa.ts `correaCards`): datos
// de la tarjeta del grupo y de cada color, con los ids de las variantes del largo más corto. Lo
// usan en runtime la island de LiveSync (listados, página de grupo) y /buscar/ para pedir solo
// esas variantes (lib/correa-server.ts). Endpoint PRERENDERIZADO: la integración
// `privateBuildManifests` (astro.config.mjs) lo mueve a dist/server/correa-cards.json (no
// público). Fuente: astro-docs (guides/endpoints «Static File Endpoints»).
import type { APIRoute } from "astro";
import { correaCards } from "$lib/correa";
import { getListedProducts } from "$lib/medusa";

export const prerender = true;

export const GET: APIRoute = async () =>
  new Response(JSON.stringify(correaCards(await getListedProducts()) ?? {}), {
    headers: { "Content-Type": "application/json" },
  });
