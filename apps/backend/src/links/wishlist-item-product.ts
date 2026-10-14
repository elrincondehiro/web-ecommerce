import { defineLink } from "@medusajs/framework/utils";
import ProductModule from "@medusajs/medusa/product";
import WishlistModule from "../modules/wishlist";

/** Producto guardado → producto (Fase L-1). Solo lectura. */
export default defineLink(
  { linkable: WishlistModule.linkable.wishlistItem.id, field: "product_id" },
  ProductModule.linkable.product,
  { readOnly: true },
);
