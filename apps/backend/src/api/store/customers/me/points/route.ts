import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { z } from "@medusajs/framework/zod";
import { pointsSummary } from "../../../../../lib/points-summary";

/**
 * GET /store/customers/me/points (Fase L-2) → `{ balance, pending, transactions, count }`.
 * La sesión la exige Medusa (`/store/customers/me*`). Solo lectura: sin workflow.
 */
export const StorePointsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { limit, offset } = StorePointsQuery.parse(req.query);
  res.json(await pointsSummary(req.scope, req.auth_context.actor_id, { limit, offset }));
}
