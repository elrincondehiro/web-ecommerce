import { defineLink } from "@medusajs/framework/utils";
import ProductModule from "@medusajs/medusa/product";
import WishlistModule from "../modules/wishlist";

/** Variante guardada (opcional) → variante (Fase L-1). Solo lectura. */
export default defineLink(
  { linkable: WishlistModule.linkable.wishlistItem.id, field: "variant_id" },
  ProductModule.linkable.productVariant,
  { readOnly: true },
);
