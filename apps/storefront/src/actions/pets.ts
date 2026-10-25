// Actions de «Mis peques» (Fase M): crear/editar (con foto) y borrar. Como el resto de la cuenta
// (src/actions/account.ts): formularios sin JS, PRG con la cookie flash (lo hace el middleware
// para `account.*`), validación con mensajes por campo en lib/pets.ts.
// La foto llega como fichero (multipart, astro-docs: actions «accept form», `File`), se reduce a
// 800 px WebP sin metadatos con sharp (lib/pet-photo.ts) y se envía al backend en base64.
// Privacidad: no se registran nombres, salud ni fotos (solo la operación y el error de la API).
import type { ActionAPIContext } from "astro:actions";
import { defineAction } from "astro:actions";
import { PETS_PATH, isUnauthorized, loginRedirect } from "$lib/account";
import { isValidId } from "$lib/cart";
import { deletePet, savePet, setPetPhoto } from "$lib/medusa";
import { petPhotoToWebp } from "$lib/pet-photo";
import { parsePetForm, photoFileError } from "$lib/pets";
import type { AccountResult } from "./account";

const editPath = (id: string | null) => (id ? `${PETS_PATH}${id}/` : `${PETS_PATH}nueva/`);

function logError(ctx: ActionAPIContext, op: string, err: unknown): void {
  ctx.logger.error(`mascotas ${op}: ${err instanceof Error ? err.message : String(err)}`);
}

const expired = (back: string): AccountResult => ({
  to: loginRedirect(back),
  flash: { code: "session_expired" },
});

/** Lo escrito en el formulario (sin el fichero) para volver a rellenarlo tras un error. */
function formValues(form: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    if (typeof v === "string" && k !== "pet_id") values[k] = v.slice(0, 500);
  }
  return values;
}

const status = (err: unknown) => (err as { status?: unknown } | null)?.status;

export const pets = {
  petSave: defineAction({
    accept: "form",
    handler: async (form, ctx): Promise<AccountResult> => {
      const idRaw = form.get("pet_id");
      const petId = typeof idRaw === "string" && idRaw ? idRaw : null;
      if (petId !== null && !isValidId(petId)) return { to: PETS_PATH, flash: { code: "error" } };
      const back = editPath(petId);
      const token = ctx.locals.customerToken;
      if (!token) return expired(back);

      const photo = form.get("photo");
      const file = photo instanceof File && photo.size > 0 ? photo : null;
      const removePhoto = form.get("photo_remove") === "on";
      const parsed = parsePetForm(form, { hasPhoto: Boolean(file) });
      const fileError = file ? photoFileError(file) : null;
      if (!parsed.ok || fileError) {
        const errors = parsed.ok ? {} : parsed.errors;
        const values = parsed.ok ? formValues(form) : parsed.values;
        if (fileError) errors.photo = fileError;
        // Los valores (sin el fichero, que no se puede devolver) para no perder lo escrito.
        return { to: back, flash: { code: "invalid", errors, values } };
      }

      let saved: { id: string };
      try {
        saved = await savePet(token, petId, parsed.data);
      } catch (err) {
        if (isUnauthorized(err)) return expired(back);
        if (status(err) === 404) return { to: PETS_PATH, flash: { code: "error" } };
        const limit = /Como mucho/.test(err instanceof Error ? err.message : "");
        if (!limit) logError(ctx, "guardar", err);
        return {
          to: back,
          flash: { code: limit ? "pet_limit" : "error", values: formValues(form) },
        };
      }

      try {
        if (file) {
          const webp = await petPhotoToWebp(await file.arrayBuffer());
          await setPetPhoto(token, saved.id, webp.toString("base64"));
        } else if (removePhoto && petId) {
          await setPetPhoto(token, saved.id, null);
        }
      } catch (err) {
        logError(ctx, "foto", err);
        return { to: editPath(saved.id), flash: { code: "pet_photo_failed" } };
      }
      return { to: PETS_PATH, flash: { code: "pet_saved" } };
    },
  }),

  petDelete: defineAction({
    accept: "form",
    handler: async (form, ctx): Promise<AccountResult> => {
      const petId = form.get("pet_id");
      if (typeof petId !== "string" || !isValidId(petId)) {
        return { to: PETS_PATH, flash: { code: "error" } };
      }
      const token = ctx.locals.customerToken;
      if (!token) return expired(PETS_PATH);
      try {
        await deletePet(token, petId);
        return { to: PETS_PATH, flash: { code: "pet_deleted" } };
      } catch (err) {
        if (isUnauthorized(err)) return expired(PETS_PATH);
        if (status(err) !== 404) logError(ctx, "borrar", err);
        return { to: PETS_PATH, flash: { code: "error" } };
      }
    },
  }),
};
