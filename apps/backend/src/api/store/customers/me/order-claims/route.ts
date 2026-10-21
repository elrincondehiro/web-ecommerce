import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { z } from "@medusajs/framework/zod";
import { claimGuestOrder } from "../../../../../lib/guest-orders-claim";

/**
 * POST /store/customers/me/order-claims `{ display_id, email }` → 202 `{ requested: true }`
 * SIEMPRE (Fase G-2): no revela si el pedido existe, si el email coincide ni si ya es de una
 * cuenta. Si es un pedido de invitado con ese email, se envía una solicitud al email del pedido
 * (o, si es el email de la propia cuenta, se pasa directamente). Sesión: la pone Medusa
 * (`/store/customers/me*`). Rate limiting: Cloudflare (docs/fases/faseG-invitados.md).
 */
export const StoreOrderClaimBody = z.object({
  display_id: z.coerce.number().int().min(1).max(2_147_483_647),
  email: z.string().trim().min(3).max(254),
});

export async function POST(
  req: AuthenticatedMedusaRequest<z.infer<typeof StoreOrderClaimBody>>,
  res: MedusaResponse,
) {
  await claimGuestOrder(req.scope, {
    customer_id: req.auth_context.actor_id,
    display_id: req.validatedBody.display_id,
    email: req.validatedBody.email,
  });
  res.status(202).json({ requested: true });
}
