import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { transferConfig } from "../../../../../lib/transfer";

/**
 * GET /store/customers/me/transfer (Fase PG-3) → `{ enabled, holder, days }`: si el cliente puede
 * pagar por transferencia (checkout). Solo con sesión: Medusa la exige en `/store/customers/me*`,
 * así que los invitados no la ven. El IBAN no se manda aquí: va en el email y en la ficha del
 * pedido (`/store/customers/me/orders/:id/transfer`).
 */
export async function GET(_req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const c = transferConfig();
  res.set("Cache-Control", "private, no-store");
  res.json(c.enabled ? { enabled: true, holder: c.holder, days: c.days } : { enabled: false });
}
