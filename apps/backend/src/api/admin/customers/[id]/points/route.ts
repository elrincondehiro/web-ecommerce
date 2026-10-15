import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { z } from "@medusajs/framework/zod";
import { randomUUID } from "node:crypto";
import { REF } from "../../../../../lib/points";
import { pointsSummary } from "../../../../../lib/points-summary";
import { pointsMovementWorkflow } from "../../../../../workflows/points";

/**
 * GET /admin/customers/:id/points (Fase L-2): saldo, pendiente y movimientos (widget del Admin).
 * POST `{ type, amount, note }`: ajuste manual con nota obligatoria (un cargo no deja el saldo
 * negativo: se recorta). Admin (Medusa protege /admin). Validación del body en middlewares.ts.
 */
export const AdminAdjustPointsBody = z.object({
  type: z.enum(["credit", "debit"]),
  amount: z.number().positive().max(100_000),
  note: z.string().trim().min(3).max(300),
});

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.json(await pointsSummary(req.scope, req.params.id ?? "", { limit: 50, offset: 0 }));
}

export async function POST(
  req: AuthenticatedMedusaRequest<z.infer<typeof AdminAdjustPointsBody>>,
  res: MedusaResponse,
) {
  const { type, amount, note } = req.validatedBody;
  const { result } = await pointsMovementWorkflow(req.scope).run({
    input: {
      customer_id: req.params.id ?? "",
      type,
      amount,
      // Cada ajuste es único (no idempotente por diseño: cada uno es una decisión distinta).
      reference: REF.adjustment,
      reference_id: randomUUID(),
      note,
      clampToBalance: type === "debit",
      metadata: { user_id: req.auth_context.actor_id },
    },
  });
  res.json({ ...result, ...(await pointsSummary(req.scope, req.params.id ?? "")) });
}
