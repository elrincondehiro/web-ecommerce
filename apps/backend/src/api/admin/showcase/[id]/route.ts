import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { z } from "@medusajs/framework/zod";
import { reviewShowcaseWorkflow } from "../../../../workflows/pets";

/** POST /admin/showcase/:id `{ decision }` (Fase MK-D): aprobar o rechazar. */
export const AdminShowcaseReviewBody = z.object({ decision: z.enum(["aprobada", "rechazada"]) });

export async function POST(
  req: AuthenticatedMedusaRequest<z.infer<typeof AdminShowcaseReviewBody>>,
  res: MedusaResponse,
) {
  const { result } = await reviewShowcaseWorkflow(req.scope).run({
    input: { pet_id: req.params.id ?? "", decision: req.validatedBody.decision },
  });
  res.json({ id: result.id, status: result.showcase_status });
}
