import { defineWidgetConfig } from "@medusajs/admin-sdk";
import type { AdminProductCategory, DetailWidgetProps } from "@medusajs/framework/types";
import { CategoryDesignPicker } from "../components/design-picker";

/**
 * Diseños de la categoría: su página y las fichas de sus productos (Fase DS,
 * admin/components/design-picker.tsx). Zona `product_category.details.side` (las `.before`/
 * `.after` son legacy desde Medusa 2.17.2; context7, admin-sdk AGENTS.md).
 */
const CategoryDesignWidget = ({ data }: DetailWidgetProps<AdminProductCategory>) => (
  <CategoryDesignPicker id={data.id} metadata={data.metadata} />
);

export const config = defineWidgetConfig({ zone: "product_category.details.side" });

export default CategoryDesignWidget;
