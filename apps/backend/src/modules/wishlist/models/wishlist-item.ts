import { model } from "@medusajs/framework/utils";
import { Wishlist } from "./wishlist";

/**
 * Producto guardado (Fase L-1, decisión W2): `product_id` siempre; `variant_id` solo si se guardó
 * una variante concreta desde la ficha. La correa a medida se guarda como producto (117 variantes).
 */
export const WishlistItem = model
  .define("wishlist_item", {
    id: model.id({ prefix: "wli" }).primaryKey(),
    product_id: model.text(),
    variant_id: model.text().nullable(),
    wishlist: model.belongsTo(() => Wishlist, { mappedBy: "items" }),
    metadata: model.json().nullable(),
  })
  // Dos índices parciales: en PostgreSQL los NULL son distintos entre sí, así que un único
  // índice (wishlist, product, variant) dejaría guardar dos veces el mismo producto sin variante.
  .indexes([
    {
      name: "IDX_wishlist_item_product_unique",
      on: ["wishlist_id", "product_id"],
      unique: true,
      where: "deleted_at IS NULL AND variant_id IS NULL",
    },
    {
      name: "IDX_wishlist_item_variant_unique",
      on: ["wishlist_id", "product_id", "variant_id"],
      unique: true,
      where: "deleted_at IS NULL AND variant_id IS NOT NULL",
    },
  ]);
