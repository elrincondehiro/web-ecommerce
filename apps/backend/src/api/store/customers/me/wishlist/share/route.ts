import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import {
  shareWishlistWorkflow,
  unshareWishlistWorkflow,
} from "../../../../../../workflows/wishlist";

/**
 * POST /store/customers/me/wishlist/share (L-1b) → `{ token }`: enlace público de la lista del
 * cliente (lo crea si no existe; si ya estaba compartida, el mismo token).
 * DELETE → `{ shared: false }`: deja de compartir (el enlace anterior da 404).
 * Token aleatorio guardado en la lista, no un JWT como en la guía oficial: no caduca, se revoca
 * y no lleva el id de la lista (docs/fases/faseL-deseos-puntos.md §6.3).
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { result } = await shareWishlistWorkflow(req.scope).run({
    input: { customer_id: req.auth_context.actor_id },
  });
  res.json({ token: result.token });
}

export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { result } = await unshareWishlistWorkflow(req.scope).run({
    input: { customer_id: req.auth_context.actor_id },
  });
  res.json(result);
}
