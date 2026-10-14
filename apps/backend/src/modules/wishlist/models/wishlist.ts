import { model } from "@medusajs/framework/utils";
import { WishlistItem } from "./wishlist-item";

/**
 * Lista de deseos (Fase L-1): una por cliente. `share_token` (L-1b): token aleatorio del enlace
 * público, nulo = no compartida. Fuente: context7 /medusajs/medusa, guía `plugins/guides/wishlist`
 * (adaptada: sin canal de venta, la tienda solo tiene uno; producto + variante opcional).
 */
export const Wishlist = model
  .define("wishlist", {
    id: model.id({ prefix: "wl" }).primaryKey(),
    customer_id: model.text(),
    share_token: model.text().nullable(),
    items: model.hasMany(() => WishlistItem, { mappedBy: "wishlist" }),
    metadata: model.json().nullable(),
  })
  .cascades({ delete: ["items"] })
  .indexes([
    { on: ["customer_id"], unique: true, where: "deleted_at IS NULL" },
    { on: ["share_token"], unique: true, where: "deleted_at IS NULL AND share_token IS NOT NULL" },
  ]);
