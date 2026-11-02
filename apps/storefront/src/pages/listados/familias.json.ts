// Familias de las opciones (Fase FO): título de la opción → sus familias en orden (id, nombre,
// color), de la metadata de las opciones de los productos listados. Lo lee /buscar/ en runtime
// (lib/search-server.ts) para poner nombre, color y orden a las facetas del motor; los listados
// estáticos lo calculan en el build (lib/facets.ts familyCatalog).
// Endpoint PRERENDERIZADO → dist/server/option-families.json (no público; `privateBuildManifests`).
import type { APIRoute } from "astro";
import { familyCatalog } from "$lib/facets";
import { getListedProducts } from "$lib/medusa";

export const prerender = true;

export const GET: APIRoute = async () =>
  new Response(JSON.stringify(Object.fromEntries(familyCatalog(await getListedProducts()))), {
    headers: { "Content-Type": "application/json" },
  });
