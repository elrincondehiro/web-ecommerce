import {
  createWorkflow,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { deleteFilesWorkflow, uploadFilesWorkflow } from "@medusajs/medusa/core-flows";
import { randomBytes } from "node:crypto";
import type { PetFields } from "../../lib/pets";
import {
  createPetStep,
  findCustomerPetStep,
  setPetPhotoStep,
  softDeletePetsStep,
  updatePetStep,
} from "./steps";

/**
 * Workflows de las mascotas (Fase M). Fuentes: context7 /medusajs/medusa (createWorkflow, `when`,
 * `runAsStep`, File Module: `uploadFilesWorkflow` con contenido en base64, `deleteFilesWorkflow`).
 * Borrar ficheros no tiene compensación en Medusa: va siempre al final del workflow.
 */

export const createPetWorkflow = createWorkflow(
  "create-pet",
  (input: { customer_id: string; fields: PetFields }) => {
    return new WorkflowResponse(createPetStep(input));
  },
);

export const updatePetWorkflow = createWorkflow(
  "update-pet",
  (input: { customer_id: string; pet_id: string; fields: PetFields }) => {
    const pet = findCustomerPetStep(input);
    return new WorkflowResponse(updatePetStep({ pet, fields: input.fields }));
  },
);

/**
 * Foto pública (con consentimiento): sube el WebP al bucket público con un nombre imposible de
 * adivinar (`mascotas/<aleatorio>-<ULID>.webp`), lo enlaza y borra la foto anterior.
 * `content: null` = quitar la foto (y el consentimiento).
 */
export const setPetPhotoWorkflow = createWorkflow(
  "set-pet-photo",
  (input: { customer_id: string; pet_id: string; content: string | null }) => {
    const pet = findCustomerPetStep(input);
    const uploaded = when({ input }, ({ input }) => Boolean(input.content)).then(() => {
      const files = transform({ input }, ({ input }) => ({
        files: [
          {
            filename: `mascotas/${randomBytes(12).toString("base64url")}.webp`,
            mimeType: "image/webp",
            content: input.content!,
            access: "public" as const,
          },
        ],
      }));
      return uploadFilesWorkflow.runAsStep({ input: files });
    });
    const photo = transform({ uploaded }, ({ uploaded }) =>
      uploaded?.[0] ? { url: uploaded[0].url, file_id: uploaded[0].id } : null,
    );
    const updated = setPetPhotoStep({ pet, photo });
    const old = transform({ pet }, ({ pet }) => (pet.photo_file_id ? [pet.photo_file_id] : []));
    when({ old }, ({ old }) => old.length > 0).then(() => {
      deleteFilesWorkflow.runAsStep({ input: { ids: old } });
    });
    return new WorkflowResponse(updated);
  },
);

/**
 * Borra una mascota (`pet_id`) o todas las del cliente (baja de la cuenta) y sus fotos.
 */
export const deletePetsWorkflow = createWorkflow(
  "delete-pets",
  (input: { customer_id: string; pet_id?: string }) => {
    const deleted = softDeletePetsStep(input);
    const fileIds = transform({ deleted }, ({ deleted }) => deleted.fileIds);
    when({ fileIds }, ({ fileIds }) => fileIds.length > 0).then(() => {
      deleteFilesWorkflow.runAsStep({ input: { ids: fileIds } });
    });
    return new WorkflowResponse(transform({ deleted }, ({ deleted }) => ({ ids: deleted.ids })));
  },
);
