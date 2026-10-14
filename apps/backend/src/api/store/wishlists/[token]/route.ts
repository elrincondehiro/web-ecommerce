import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { WISHLIST_MODULE } from "../../../../modules/wishlist";
import type WishlistModuleService from "../../../../modules/wishlist/service";
import { SHARE_TOKEN_RE } from "../../../../workflows/wishlist/steps";

/**
 * GET /store/wishlists/:token (L-1b, público, sin sesión; la publishable key la exige Medusa en
 * /store) → `{ items: [{ product_id, variant_id }] }`. SOLO productos: ni cliente, ni id de la
 * lista, ni fechas (G8: sin datos personales). Token mal formado, desconocido o revocado → 404
 * (misma respuesta). Solo lectura: sin workflow.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const token = req.params.token ?? "";
  const notFound = new MedusaError(MedusaError.Types.NOT_FOUND, "Lista no encontrada");
  if (!SHARE_TOKEN_RE.test(token)) throw notFound;
  const service = req.scope.resolve<WishlistModuleService>(WISHLIST_MODULE);
  const [wishlist] = await service.listWishlists({ share_token: token });
  if (!wishlist) throw notFound;
  const items = await service.listWishlistItems(
    { wishlist_id: wishlist.id },
    { select: ["product_id", "variant_id"], order: { created_at: "DESC" } },
  );
  res.json({ items: items.map((i) => ({ product_id: i.product_id, variant_id: i.variant_id })) });
}
