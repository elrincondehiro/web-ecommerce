import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { deleteStockAlertsWorkflow } from "../../../../../../workflows/stock-alerts";

/** DELETE /store/customers/me/stock-alerts/:id (Fase MK-B). Ajeno o inexistente → `deleted: false`. */
export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { result } = await deleteStockAlertsWorkflow(req.scope).run({
    input: { customer_id: req.auth_context.actor_id, ids: [req.params.id ?? ""] },
  });
  res.json({ id: req.params.id, deleted: result.length > 0 });
}
