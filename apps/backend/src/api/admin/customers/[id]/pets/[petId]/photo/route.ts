import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { z } from "@medusajs/framework/zod";
import { petsApi } from "../../../../../../../lib/pets-routes";
import type { PetPhotoBody } from "../../../../../../../lib/pets-schema";

/**
 * Foto desde el Admin (Fase M): el widget la reduce en el navegador (canvas → WebP, sin metadatos).
 * `consent: true` = el cliente acepta que sea pública. DELETE → quitarla.
 */
export async function POST(
  req: AuthenticatedMedusaRequest<z.infer<typeof PetPhotoBody>>,
  res: MedusaResponse,
) {
  res.json(
    await petsApi.setPhoto(
      req.scope,
      req.params.id ?? "",
      req.params.petId ?? "",
      req.validatedBody.content,
    ),
  );
}

export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.json(await petsApi.setPhoto(req.scope, req.params.id ?? "", req.params.petId ?? "", null));
}
