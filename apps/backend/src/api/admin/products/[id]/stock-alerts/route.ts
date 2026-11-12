import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { stockAlertsSummary } from "../../../../../lib/stock-alerts-summary";

/** GET /admin/products/:id/stock-alerts (Fase MK-B): espera por variante de un producto (widget). */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.json({ rows: await stockAlertsSummary(req.scope, req.params.id ?? "") });
}
