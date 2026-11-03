import { defineWidgetConfig } from "@medusajs/admin-sdk";
import type { AdminProduct, DetailWidgetProps } from "@medusajs/framework/types";
import { ProductDesignPicker } from "../components/design-picker";

/**
 * Diseño de la ficha del producto (Fase DS, admin/components/design-picker.tsx). Zona
 * `product.details.side`: las `.before`/`.after` son legacy desde Medusa 2.17.2 (context7,
 * admin-sdk AGENTS.md; lista en @medusajs/admin-shared 2.22.2 `PRODUCT_INJECTION_ZONES`).
 */
const ProductDesignWidget = ({ data }: DetailWidgetProps<AdminProduct>) => (
  <ProductDesignPicker
    id={data.id}
    metadata={data.metadata}
    categoryIds={(data.categories ?? []).flatMap((c) => (c?.id ? [c.id] : []))}
  />
);

export const config = defineWidgetConfig({ zone: "product.details.side" });

export default ProductDesignWidget;
