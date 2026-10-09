// Presets de imagen de producto (fase 6), compartidos por <ProductImage> y por el manifiesto de
// miniaturas de /buscar/ (fase 7-1, D6). Las mismas opciones dan el MISMO hash de Astro
// (src, width, height, format, quality, fit, position), así que las tarjetas de /buscar/
// reutilizan los ficheros del catálogo en /_astro/ sin transformar nada en runtime.
export type ImageVariant = "card" | "detail" | "thumb";

export const IMAGE_PRESETS: Record<
  ImageVariant,
  { width: number; widths: number[]; sizes: string }
> = {
  // Rejilla: 2 cols (móvil) · 3 (sm) · 4 (lg, contenedor max-w-6xl = 1152px), con px-4 y gap-4.
  // `sizes` = ancho REAL de la tarjeta (auditoría pre-fase 10: con "50vw" un móvil de 412px y
  // DPR 2,6 pedía la de 480px para 178px CSS). 240 cubre los móviles de DPR ≤ 2,6 en 2 columnas.
  card: {
    width: 640,
    widths: [240, 320, 480, 640],
    sizes:
      "(min-width: 1024px) min(calc(25vw - 1.75rem), 270px), (min-width: 640px) calc(33.33vw - 1.7rem), calc(50vw - 1.5rem)",
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

/**
 * `sizes` de las tarjetas del carrusel de la home (más estrechas que en la rejilla: 2,3 · 3,3 ·
 * 4,3 por vista, global.css `.carousel__track`). Mismos ficheros que `card` (el `sizes` no
 * cambia el hash): solo cambia qué ancho del srcset elige el navegador.
 */
export const CAROUSEL_CARD_SIZES =
  "(min-width: 1024px) calc((min(100vw, 72rem) - 6rem) / 4.3), (min-width: 640px) calc((100vw - 5rem) / 3.3), calc((100vw - 4.5rem) / 2.3)";

/** `sizes` de las tarjetas de categorías de la home: 2 · 3 (sm) · 5 (lg) columnas, gap-4. */
export const CATEGORY_CARD_SIZES =
  "(min-width: 1024px) min(calc(20vw - 1.6rem), 217px), (min-width: 640px) calc(33.33vw - 1.7rem), calc(50vw - 1.5rem)";

export const IMAGE_FORMATS = ["avif", "webp"] as const;
export const IMAGE_FALLBACK_FORMAT = "webp" as const;

/** Miniatura ya generada en el build: lo necesario para pintar un <picture> sin sharp. */
export interface CardImage {
  /** srcset por formato, en el orden de IMAGE_FORMATS. */
  sources: { type: string; srcset: string }[];
  src: string;
  srcset: string;
}
