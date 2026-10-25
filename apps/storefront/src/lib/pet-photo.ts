// Foto de mascota (Fase M): se reduce y limpia en el servidor de Astro antes de enviarla al
// backend, que la guarda en el bucket PÚBLICO (con el consentimiento del cliente).
// - `autoOrient()`: aplica la orientación EXIF (fotos del móvil) antes de quitar los metadatos.
// - Por defecto sharp NO copia los metadatos a la salida (EXIF con GPS, XMP, IPTC, ICC): «The
//   default behaviour, when keepMetadata is not used, is to … strip all metadata» (context7
//   /lovell/sharp, api-output keepMetadata). Por eso no se llama a keepMetadata/withMetadata.
// - `limitInputPixels`: tope de píxeles de la imagen de entrada (por defecto ~268 Mpx); se baja a
//   50 Mpx (una foto de móvil de 48 Mpx cabe) para no gastar memoria con imágenes enormes.
// - Solo la primera página/frame (`pages: 1`): sin animaciones.
// sharp ya es dependencia del storefront (servicio de imágenes de Astro); en runtime se carga
// solo aquí (import dinámico), no en el resto de rutas.
import { PET_PHOTO_PX } from "./pets";

export async function petPhotoToWebp(input: ArrayBuffer): Promise<Buffer> {
  const { default: sharp } = await import("sharp");
  return sharp(Buffer.from(input), { limitInputPixels: 50_000_000, pages: 1, failOn: "error" })
    .autoOrient()
    .resize(PET_PHOTO_PX, PET_PHOTO_PX, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
}
