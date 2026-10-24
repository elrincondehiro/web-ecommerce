import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { petsApi } from "../../../../../lib/pets-routes";
import type { PetBodyInput } from "../../../../../lib/pets-schema";
import { assertCustomer } from "../../../../../lib/pets-view";

/**
 * Mascotas de un cliente en el Admin (Fase M; widgets de cliente y pedido). Medusa protege
 * `/admin*`. En el Admin, `health_consent` = «el cliente lo ha autorizado».
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.json(await petsApi.list(req.scope, req.params.id ?? ""));
}

export async function POST(req: AuthenticatedMedusaRequest<PetBodyInput>, res: MedusaResponse) {
  await assertCustomer(req.scope, req.params.id ?? "");
  res.status(201).json(await petsApi.create(req.scope, req.params.id ?? "", req.validatedBody));
}
