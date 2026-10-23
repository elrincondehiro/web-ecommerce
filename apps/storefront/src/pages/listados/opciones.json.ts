// Opciones que NO son filtro (Fase O): títulos de las opciones globales con
// `metadata.filtrable = false` (Admin). Lo lee /buscar/ en runtime (lib/search-server.ts) para
// quitar esas facetas del motor; los listados estáticos lo calculan en el build (lib/facets.ts).
// Endpoint PRERENDERIZADO → dist/server/hidden-options.json (no público; `privateBuildManifests`).
import type { APIRoute } from "astro";
import { hiddenOptionTitles } from "$lib/facets";
import { getListedProducts } from "$lib/medusa";

export const prerender = true;

export const GET: APIRoute = async () =>
  new Response(
    JSON.stringify(
      Object.fromEntries([...hiddenOptionTitles(await getListedProducts())].map((t) => [t, 1])),
    ),
    { headers: { "Content-Type": "application/json" } },
  );
