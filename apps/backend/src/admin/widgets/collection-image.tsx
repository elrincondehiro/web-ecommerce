import { defineWidgetConfig } from "@medusajs/admin-sdk";
import type { AdminCollection, DetailWidgetProps } from "@medusajs/framework/types";
import { EntityImageWidget } from "../components/entity-image";

/** Foto propia y descripción de la colección (Fase H). Zona `product_collection.details.after` (context7). */
const CollectionImageWidget = ({ data }: DetailWidgetProps<AdminCollection>) => (
  <EntityImageWidget
    kind="collections"
    id={data.id}
    metadata={data.metadata}
    usage="Se ve en la cabecera de la página de la colección (/coleccion/…) y en su tarjeta de la home."
    withDescription
  />
);

export const config = defineWidgetConfig({ zone: "product_collection.details.after" });

export default CollectionImageWidget;
