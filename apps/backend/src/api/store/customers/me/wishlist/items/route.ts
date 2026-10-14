import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { z } from "@medusajs/framework/zod";
import { addToWishlistWorkflow } from "../../../../../../workflows/wishlist";

/**
 * POST /store/customers/me/wishlist/items (Fase L-1) → `{ item, created }`. Idempotente: si ya
 * estaba, 200 con `created: false`. Validación del body en src/api/middlewares.ts.
 */
export const StoreAddWishlistItemBody = z.object({
  product_id: z.string().regex(/^prod_[0-9A-Za-z]{1,40}$/),
  variant_id: z
    .string()
    .regex(/^variant_[0-9A-Za-z]{1,40}$/)
    .nullish(),
});

export async function POST(
  req: AuthenticatedMedusaRequest<z.infer<typeof StoreAddWishlistItemBody>>,
  res: MedusaResponse,
) {
  const { product_id, variant_id } = req.validatedBody;
  const { result } = await addToWishlistWorkflow(req.scope).run({
    input: {
      customer_id: req.auth_context.actor_id,
      product_id,
      variant_id: variant_id ?? null,
      sales_channel_ids: req.publishable_key_context?.sales_channel_ids ?? [],
    },
  });
  res.status(result.created ? 201 : 200).json({
    item: {
      id: result.item.id,
      product_id: result.item.product_id,
      variant_id: result.item.variant_id,
    },
    created: result.created,
  });
}
