import { defineWidgetConfig } from "@medusajs/admin-sdk";
import type { AdminProductCategory, DetailWidgetProps } from "@medusajs/framework/types";
import { EntityImageWidget } from "../components/entity-image";

/** Foto propia de la categoría (Fase H). Zona `product_category.details.after` (context7). */
const CategoryImageWidget = ({ data }: DetailWidgetProps<AdminProductCategory>) => (
  <EntityImageWidget
    kind="product-categories"
    id={data.id}
    metadata={data.metadata}
    usage="Se ve en la tarjeta de la categoría en la home (categorías destacadas)."
  />
);

export const config = defineWidgetConfig({ zone: "product_category.details.after" });

export default CategoryImageWidget;
