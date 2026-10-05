// Presets de imagen de producto (fase 6), compartidos por <ProductImage> y por el manifiesto de
// miniaturas de /buscar/ (fase 7-1, D6). Las mismas opciones dan el MISMO hash de Astro
// (src, width, height, format, quality, fit, position), así que las tarjetas de /buscar/
// reutilizan los ficheros del catálogo en /_astro/ sin transformar nada en runtime.
export type ImageVariant = "card" | "detail" | "thumb";

export const IMAGE_PRESETS: Record<
  ImageVariant,
  { width: number; widths: number[]; sizes: string }
> = {
  // Rejilla: 2 cols (móvil) · 3 (sm) · 4 (lg, contenedor max-w-6xl = 1152px)
  card: {
    width: 640,
    widths: [320, 480, 640],
    sizes: "(min-width: 1024px) 270px, (min-width: 640px) 33vw, 50vw",
  },
  // Ficha: 1 col (móvil, ancho − px-4·2) · 2 cols con gap-8 (md) · máx. 544px (max-w-6xl).
  // 800 cubre el móvil típico (≈380px CSS × DPR 1,75–2 ≈ 665–760px) sin saltar a 960.
  detail: {
    width: 1200,
    widths: [640, 800, 960, 1200],
    sizes: "(min-width: 1152px) 544px, (min-width: 768px) calc(50vw - 2rem), calc(100vw - 2rem)",
  },
  // Miniaturas de la galería
  thumb: { width: 160, widths: [80, 160], sizes: "80px" },
};

export const IMAGE_FORMATS = ["avif", "webp"] as const;
export const IMAGE_FALLBACK_FORMAT = "webp" as const;

/** Miniatura ya generada en el build: lo necesario para pintar un <picture> sin sharp. */
export interface CardImage {
  /** srcset por formato, en el orden de IMAGE_FORMATS. */
  sources: { type: string; srcset: string }[];
  src: string;
  srcset: string;
}
