import { useState, type FormEvent } from "react";

/**
 * Foto propia de una categoría o colección (Fase H), para la home y la página de colección del
 * storefront (lib/entity-image.ts). Sin rutas propias: la API estándar del Admin.
 * - Subir: la foto se reduce aquí (canvas → WebP de 1600 px como máximo; al redibujarla se pierden
 *   los metadatos, GPS incluido) y va a `POST /admin/uploads` (fichero público: SeaweedFS / R2).
 * - Guardar: `POST /admin/product-categories/:id` o `/admin/collections/:id` con la `metadata`
 *   COMPLETA (se conservan las demás claves) + `imagen_url`, `imagen_file_id`, `imagen_alt`.
 *   Probado en Medusa 2.22.1: la de las CATEGORÍAS se sustituye y la de las COLECCIONES se fusiona
 *   (`mergeMetadata`: "" borra la clave). Para que valga en los dos casos, al quitar la foto se
 *   mandan sus claves con "" (en la categoría quedan como ""; el storefront lo trata como «sin
 *   foto»).
 * - Cambiar o quitar: el fichero anterior se borra (`DELETE /admin/uploads/:id`) DESPUÉS de
 *   guardar la entidad (si falla el borrado, queda un huérfano; nunca una foto rota).
 * El storefront la muestra tras el siguiente build. Fuente: context7 /medusajs/medusa (admin
 * widgets, POST /admin/uploads) + código de @medusajs/medusa 2.22.1 (validators de metadata).
 */
export type EntityKind = "product-categories" | "collections";

type Meta = Record<string, unknown> | null | undefined;

const MAX_PX = 1600;
const KEYS = ["imagen_url", "imagen_file_id", "imagen_alt"] as const;

const button =
  "bg-ui-button-inverted text-ui-fg-on-inverted rounded-md px-3 py-1.5 text-sm disabled:opacity-50";
const secondary = "rounded-md border border-ui-border-base px-3 py-1.5 text-sm disabled:opacity-50";
const input = "rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1 text-sm";

/** Imagen → WebP de MAX_PX como máximo (sin metadatos: el canvas no los copia). */
async function toWebp(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/webp", 0.85));
  if (!blob || blob.type !== "image/webp") throw new Error("El navegador no genera WebP");
  const base = file.name.replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "-") || "foto";
  return new File([blob], `${base}.webp`, { type: "image/webp" });
}

async function api(url: string, init?: RequestInit) {
  const r = await fetch(url, { credentials: "include", ...init });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((json as { message?: string }).message ?? `Error ${r.status}`);
  return json as Record<string, unknown>;
}

/** Metadata con los campos de la foto vacíos ("" = borrar en colecciones; ver arriba). */
function withoutImage(meta: Meta): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(meta ?? {}) };
  for (const k of KEYS) out[k] = "";
  return out;
}

export function EntityImageWidget({
  kind,
  id,
  metadata,
  usage,
  withDescription = false,
}: {
  kind: EntityKind;
  id: string;
  metadata: Meta;
  /** Dónde se ve la foto en la tienda (texto de ayuda). */
  usage: string;
  /**
   * Campo «Descripción» (`metadata.descripcion`): las colecciones no tienen descripción propia
   * en Medusa (las categorías sí: se edita en su ficha). Sale en la cabecera de su página.
   */
  withDescription?: boolean;
}) {
  const [meta, setMeta] = useState<Meta>(metadata);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const url = typeof meta?.imagen_url === "string" && meta.imagen_url ? meta.imagen_url : null;
  const fileId =
    typeof meta?.imagen_file_id === "string" && meta.imagen_file_id ? meta.imagen_file_id : null;
  const alt = typeof meta?.imagen_alt === "string" ? meta.imagen_alt : "";
  const description = typeof meta?.descripcion === "string" ? meta.descripcion : "";

  const save = async (next: Record<string, unknown>) => {
    const res = await api(`/admin/${kind}/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metadata: next }),
    });
    const entity = (res.product_category ?? res.collection) as { metadata?: Meta } | undefined;
    setMeta(entity?.metadata ?? next);
  };

  const removeFile = async (oldId: string | null) => {
    if (!oldId) return;
    // El id es la clave del fichero, con su carpeta (`categorias/…`): codificado, la barra va
    // en un solo segmento de la ruta (`/admin/uploads/:id`).
    await api(`/admin/uploads/${encodeURIComponent(oldId)}`, { method: "DELETE" }).catch(
      () => undefined,
    );
  };

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setMsg(null);
    try {
      setMsg({ ok: true, text: await fn() });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const file = form.get("foto");
    const newAlt = String(form.get("alt") ?? "").trim();
    // Solo con el campo: "" la borra (colecciones: `mergeMetadata`; categorías no lo usan).
    const text = withDescription
      ? { descripcion: String(form.get("descripcion") ?? "").trim() }
      : {};
    void run(async () => {
      if (file instanceof File && file.size > 0) {
        const body = new FormData();
        const webp = await toWebp(file);
        body.append("files", webp, webp.name);
        // Carpeta del bucket (Fase H): el middleware de /admin/uploads la lee de esta cabecera.
        const folder = kind === "collections" ? "colecciones" : "categorias";
        const { files } = (await api("/admin/uploads", {
          method: "POST",
          body,
          headers: { "x-upload-folder": folder },
        })) as {
          files?: { id: string; url: string }[];
        };
        const up = files?.[0];
        if (!up) throw new Error("No se ha podido subir la foto");
        await save({
          ...withoutImage(meta),
          ...text,
          imagen_url: up.url,
          imagen_file_id: up.id,
          imagen_alt: newAlt,
        });
        await removeFile(fileId);
        e.currentTarget?.reset();
        return "Guardado. Se verá en la tienda tras el próximo despliegue.";
      }
      if (!url && !withDescription) throw new Error("Elige una foto");
      await save({ ...(meta ?? {}), ...text, ...(url ? { imagen_alt: newAlt } : {}) });
      return "Guardado. Se verá en la tienda tras el próximo despliegue.";
    });
  };

  const onRemove = () =>
    void run(async () => {
      await save(withoutImage(meta));
      await removeFile(fileId);
      return "Foto quitada: la tienda usará la de su primer producto.";
    });

  return (
    <div className="shadow-elevation-card-rest bg-ui-bg-base rounded-lg px-6 py-4">
      <h2 className="font-sans text-base font-medium">
        {withDescription ? "Foto y descripción de la tienda" : "Foto de la tienda"}
      </h2>
      <p className="text-ui-fg-subtle mt-1 text-sm">
        {usage} Sin foto, se usa la del primer producto. Se reduce a WebP de {MAX_PX} px y sin datos
        de ubicación.
      </p>
      {url && (
        <img
          src={url}
          alt={alt}
          className="border-ui-border-base mt-3 aspect-[3/1] w-full max-w-md rounded-md border object-cover"
        />
      )}
      <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-sm">
          {url ? "Cambiar foto" : "Foto"}
          <input
            name="foto"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            className="text-sm"
            disabled={busy}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Texto alternativo (qué se ve en la foto; vacío si es decorativa)
          <input
            key={alt}
            name="alt"
            defaultValue={alt}
            maxLength={150}
            className={input}
            disabled={busy}
          />
        </label>
        {withDescription && (
          <label className="flex flex-col gap-1 text-sm">
            Descripción (sale bajo el título de la página; vacía = sin descripción)
            <textarea
              key={description}
              name="descripcion"
              defaultValue={description}
              maxLength={600}
              rows={3}
              className={input}
              disabled={busy}
            />
          </label>
        )}
        <div className="flex gap-2">
          <button type="submit" className={button} disabled={busy}>
            {busy ? "Guardando…" : "Guardar"}
          </button>
          {url && (
            <button type="button" className={secondary} disabled={busy} onClick={onRemove}>
              Quitar foto
            </button>
          )}
        </div>
        {msg && (
          <p
            role={msg.ok ? "status" : "alert"}
            className={`text-sm ${msg.ok ? "text-ui-fg-interactive" : "text-ui-fg-error"}`}
          >
            {msg.text}
          </p>
        )}
      </form>
    </div>
  );
}
