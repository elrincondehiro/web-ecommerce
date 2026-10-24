import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { petsApi } from "../../../../../../lib/pets-routes";
import type { PetBodyInput } from "../../../../../../lib/pets-schema";

/** Editar (POST) o borrar (DELETE) una mascota del cliente desde el Admin (Fase M). */
export async function POST(req: AuthenticatedMedusaRequest<PetBodyInput>, res: MedusaResponse) {
  res.json(
    await petsApi.update(req.scope, req.params.id ?? "", req.params.petId ?? "", req.validatedBody),
  );
}

export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.json(await petsApi.remove(req.scope, req.params.id ?? "", req.params.petId ?? ""));
}
