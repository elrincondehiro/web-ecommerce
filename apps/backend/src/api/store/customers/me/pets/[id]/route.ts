import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { petsApi } from "../../../../../../lib/pets-routes";
import type { PetBodyInput } from "../../../../../../lib/pets-schema";

/**
 * POST /store/customers/me/pets/:id → `{ pet }` (editar; la foto va aparte). DELETE → borra la
 * mascota y su foto. Una mascota de otro cliente da 404 (no se distingue de «no existe»).
 */
export async function POST(req: AuthenticatedMedusaRequest<PetBodyInput>, res: MedusaResponse) {
  res.json(
    await petsApi.update(
      req.scope,
      req.auth_context.actor_id,
      req.params.id ?? "",
      req.validatedBody,
    ),
  );
}

export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.json(await petsApi.remove(req.scope, req.auth_context.actor_id, req.params.id ?? ""));
}
