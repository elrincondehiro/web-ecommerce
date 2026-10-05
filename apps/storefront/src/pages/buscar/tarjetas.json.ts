// Manifiesto de miniaturas para /buscar/ (fase 7-1, D6). Endpoint PRERENDERIZADO: en el build
// llama a getImage() con las MISMAS opciones que <ProductImage variant="card"> → mismo hash →
// los ficheros de /_astro/ ya existen (se generan una vez para catálogo y búsqueda). /buscar/ lo
// lee del disco (lib/card-images.ts) y pinta <picture> sin sharp en runtime.
// Fuente: astro-docs (guides/endpoints "Static File Endpoints"; reference/modules/astro-assets
// getImage) y el código de astro 7.3.5 (components/Picture.astro, assets/utils/hash.js).
import type { APIRoute } from "astro";
import { getImage } from "astro:assets";
import { getAllProducts } from "$lib/medusa";
import { IMAGE_FALLBACK_FORMAT, IMAGE_FORMATS, IMAGE_PRESETS, type CardImage } from "$lib/images";

export const prerender = true;

const preset = IMAGE_PRESETS.card;
const base = {
  width: preset.width,
  height: preset.width,
  widths: preset.widths,
  fit: "cover",
  position: "center",
} as const;

async function cardImage(src: string): Promise<CardImage> {
  const sources = await Promise.all(
    IMAGE_FORMATS.map(async (format) => {
      const img = await getImage({ ...base, src, format });
      return { type: `image/${format}`, srcset: img.srcSet.attribute };
    }),
  );
  const fallback = await getImage({ ...base, src, format: IMAGE_FALLBACK_FORMAT });
  return { sources, src: fallback.src, srcset: fallback.srcSet.attribute };
}

export const GET: APIRoute = async () => {
  const entries: [string, CardImage][] = [];
  for (const p of await getAllProducts()) {
    const src = p.thumbnail ?? p.images?.[0]?.url;
    if (src) entries.push([p.id, await cardImage(src)]);
  }
  return new Response(JSON.stringify(Object.fromEntries(entries)), {
    headers: { "Content-Type": "application/json" },
  });
};
