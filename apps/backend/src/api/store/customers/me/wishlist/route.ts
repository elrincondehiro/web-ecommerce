import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { WISHLIST_MODULE } from "../../../../../modules/wishlist";
import type WishlistModuleService from "../../../../../modules/wishlist/service";

/**
 * GET /store/customers/me/wishlist (Fase L-1) → `{ items: [{ id, product_id, variant_id,
 * created_at }], share_token }`, del más reciente al más antiguo. Solo ids: precio y stock los pide el
 * storefront a la Store API (región, canal y cálculo de precio de Medusa). Sin lista → `[]`.
 * La sesión la exige Medusa (`/store/customers/me*`); el cliente sale del token.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve<WishlistModuleService>(WISHLIST_MODULE);
  const [wishlist] = await service.listWishlists({ customer_id: req.auth_context.actor_id });
  if (!wishlist) {
    res.json({ items: [], share_token: null });
    return;
  }
  const items = await service.listWishlistItems(
    { wishlist_id: wishlist.id },
    { select: ["id", "product_id", "variant_id", "created_at"], order: { created_at: "DESC" } },
  );
  // `share_token` (L-1b): enlace público si la lista está compartida (solo lo ve su dueño).
  res.json({ items, share_token: wishlist.share_token ?? null });
}
