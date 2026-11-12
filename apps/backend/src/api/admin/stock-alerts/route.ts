import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { stockAlertsSummary } from "../../../lib/stock-alerts-summary";

/**
 * GET /admin/stock-alerts (Fase MK-B): lista de espera completa (página «Avisos de stock» del
 * Admin). Sin datos de los clientes: solo cuántos. Medusa protege /admin.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const rows = await stockAlertsSummary(req.scope);
  res.json({ rows, customers: rows.reduce((n, r) => n + r.waiting, 0) });
}
