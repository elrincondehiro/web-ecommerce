// Foto propia de categorías y colecciones (Fase H). La sube el widget del Admin
// (apps/backend/src/admin/components/entity-image.tsx) y la guarda en la `metadata` de la entidad:
//   imagen_url  URL pública del fichero (bucket: SeaweedFS en local, R2 en producción)
//   imagen_alt  texto alternativo (opcional)
// Sin foto, la tarjeta usa la del primer producto (como antes de la Fase H). Funciones PURAS.

export interface EntityImage {
  src: string;
  /** Texto alternativo; "" = decorativa (la tarjeta ya lleva el nombre). */
  alt: string;
}

type Metadata = Record<string, unknown> | null | undefined;

/** Foto propia de la metadata, si la hay (URL http(s) válida). */
export function metadataImage(metadata: Metadata): EntityImage | null {
  const url = metadata?.imagen_url;
  if (typeof url !== "string" || !/^https?:\/\//.test(url)) return null;
  const alt = metadata?.imagen_alt;
  return { src: url, alt: typeof alt === "string" ? alt.trim() : "" };
}

/** Descripción propia de una colección (`metadata.descripcion`), recortada; "" si no hay. */
export function metadataDescription(metadata: Metadata): string {
  const d = metadata?.descripcion;
  return typeof d === "string" ? d.trim() : "";
}

/** Foto de una tarjeta: la propia o, si no hay, la del primer producto con foto (alt vacío). */
export function cardImage(
  metadata: Metadata,
  products: readonly { thumbnail?: string | null; images?: { url?: string | null }[] | null }[],
): EntityImage | null {
  const own = metadataImage(metadata);
  if (own) return own;
  for (const p of products) {
    const src = p.thumbnail ?? p.images?.[0]?.url;
    if (src) return { src, alt: "" };
  }
  return null;
}
