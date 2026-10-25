import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { z } from "@medusajs/framework/zod";
import { petsApi } from "../../../../../../../lib/pets-routes";
import type { PetPhotoBody } from "../../../../../../../lib/pets-schema";

/**
 * POST /store/customers/me/pets/:id/photo `{ content, consent: true }` → `{ pet }`: foto pública
 * (WebP ya reducido por el storefront, base64). DELETE → quita la foto y el consentimiento.
 */
export async function POST(
  req: AuthenticatedMedusaRequest<z.infer<typeof PetPhotoBody>>,
  res: MedusaResponse,
) {
  res.json(
    await petsApi.setPhoto(
      req.scope,
      req.auth_context.actor_id,
      req.params.id ?? "",
      req.validatedBody.content,
    ),
  );
}

export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.json(await petsApi.setPhoto(req.scope, req.auth_context.actor_id, req.params.id ?? "", null));
}
