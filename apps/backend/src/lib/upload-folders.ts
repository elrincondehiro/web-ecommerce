/**
 * Carpetas del bucket (Fase H). Cada fichero nuevo va a una carpeta según lo que es; el proveedor
 * `file-s3` respeta la carpeta del nombre (`<carpeta>/<nombre>-<ulid>.<ext>`, @medusajs/file-s3
 * 2.22.1 `upload`). Funciones PURAS (las usan el middleware de `/admin/uploads`, los widgets,
 * `images:import` y las mascotas).
 *
 *   productos/     fotos de productos y variantes (Admin, `images:import`)
 *   categorias/    foto propia de una categoría (widget)
 *   colecciones/   foto propia de una colección (widget)
 *   mascotas/      fotos de «Mis peques» (Fase M)
 *   contenido/     el resto de lo que se sube desde el Admin
 */
export const UPLOAD_FOLDERS = {
  product: "productos",
  category: "categorias",
  collection: "colecciones",
  pet: "mascotas",
  content: "contenido",
} as const;
export type UploadFolder = (typeof UPLOAD_FOLDERS)[keyof typeof UPLOAD_FOLDERS];

const KNOWN = new Set<string>(Object.values(UPLOAD_FOLDERS));

/**
 * Cabecera con la carpeta de una subida desde NUESTROS widgets (el nombre del fichero no sirve:
 * multer lo deja sin ruta). Solo se aceptan las carpetas conocidas.
 */
export const UPLOAD_FOLDER_HEADER = "x-upload-folder";

/** Carpeta conocida o null (valor de la cabecera `x-upload-folder`). */
export function knownFolder(value: string | undefined | null): UploadFolder | null {
  return value && KNOWN.has(value) ? (value as UploadFolder) : null;
}

/**
 * Carpeta de una subida del Admin estándar, por la página desde la que se sube (cabecera
 * `Referer` del navegador: `/app/products/…`, `/app/categories/…`, `/app/collections/…`). El
 * formulario de productos del Admin no permite elegir carpeta; sin `Referer` reconocible, la de
 * contenido.
 */
export function folderFromReferer(referer: string | undefined | null): UploadFolder {
  let path: string;
  try {
    path = referer ? new URL(referer).pathname : "";
  } catch {
    path = "";
  }
  if (/\/app\/products(\/|$)/.test(path)) return UPLOAD_FOLDERS.product;
  if (/\/app\/categories(\/|$)/.test(path)) return UPLOAD_FOLDERS.category;
  if (/\/app\/collections(\/|$)/.test(path)) return UPLOAD_FOLDERS.collection;
  return UPLOAD_FOLDERS.content;
}

/**
 * Nombre con su carpeta: quita cualquier ruta que traiga (solo el nombre del fichero) y antepone
 * la carpeta. Si ya empieza por una carpeta conocida, se deja tal cual (idempotente: un widget
 * o un script que ya la pone).
 */
export function withFolder(folder: UploadFolder, filename: string): string {
  const clean = filename.replace(/\\/g, "/");
  const first = clean.split("/")[0] ?? "";
  if (clean.includes("/") && KNOWN.has(first)) return clean;
  const base = clean.split("/").pop() || "fichero";
  return `${folder}/${base}`;
}
