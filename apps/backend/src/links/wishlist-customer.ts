import { defineLink } from "@medusajs/framework/utils";
import CustomerModule from "@medusajs/medusa/customer";
import WishlistModule from "../modules/wishlist";

/** Lista → cliente (Fase L-1). Solo lectura: sin tabla de enlace. Guía oficial `wishlist`. */
export default defineLink(
  { linkable: WishlistModule.linkable.wishlist.id, field: "customer_id" },
  CustomerModule.linkable.customer,
  { readOnly: true },
);
