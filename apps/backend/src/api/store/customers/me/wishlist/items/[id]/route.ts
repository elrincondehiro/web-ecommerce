import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { removeFromWishlistWorkflow } from "../../../../../../../workflows/wishlist";

/**
 * DELETE /store/customers/me/wishlist/items/:id (Fase L-1) → `{ id, deleted }`. Si el producto
 * guardado no es del cliente, `deleted: false` (no se distingue de «no existe»).
 */
export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const id = req.params.id ?? "";
  const { result } = await removeFromWishlistWorkflow(req.scope).run({
    input: { customer_id: req.auth_context.actor_id, item_id: id },
  });
  res.json({ id, deleted: result.removed });
}
