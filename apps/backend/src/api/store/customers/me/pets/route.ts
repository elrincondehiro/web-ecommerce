import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { petsApi } from "../../../../../lib/pets-routes";
import type { PetBodyInput } from "../../../../../lib/pets-schema";

/**
 * Mascotas del cliente (Fase M). La sesión la exige Medusa (`/store/customers/me*`); el cliente
 * sale del token. Validación del body (`PetBody`) en src/api/middlewares.ts.
 * GET → `{ pets }` (vivas primero, después las fallecidas). POST → 201 `{ pet }`.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.json(await petsApi.list(req.scope, req.auth_context.actor_id));
}

export async function POST(req: AuthenticatedMedusaRequest<PetBodyInput>, res: MedusaResponse) {
  res
    .status(201)
    .json(await petsApi.create(req.scope, req.auth_context.actor_id, req.validatedBody));
}
