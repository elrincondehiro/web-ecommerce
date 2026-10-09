import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { z } from "@medusajs/framework/zod";
import { requestAccountDeletionWorkflow } from "../../../../../workflows/request-account-deletion";

/**
 * POST /store/customers/me/deletion-request (fase 9) → 202. Requiere sesión de cliente:
 * Medusa protege todo `/store/customers/me*` con `authenticate("customer", …)`; el id sale del
 * token, nunca del body. Validación del body en src/api/middlewares.ts.
 */
export const StoreDeletionRequestBody = z.object({
  reason: z.string().trim().max(500).optional(),
});

export async function POST(
  req: AuthenticatedMedusaRequest<z.infer<typeof StoreDeletionRequestBody>>,
  res: MedusaResponse,
) {
  const reason = req.validatedBody?.reason || null;
  await requestAccountDeletionWorkflow(req.scope).run({
    input: { customer_id: req.auth_context.actor_id, reason },
  });
  res.status(202).json({ requested: true });
}
