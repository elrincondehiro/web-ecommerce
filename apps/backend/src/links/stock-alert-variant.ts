import { defineLink } from "@medusajs/framework/utils";
import ProductModule from "@medusajs/medusa/product";
import StockAlertModule from "../modules/stock-alert";

/** Aviso de stock → variante (Fase MK-B). Solo lectura: título, producto y SKU por Query. */
export default defineLink(
  { linkable: StockAlertModule.linkable.stockAlert.id, field: "variant_id" },
  ProductModule.linkable.productVariant,
  { readOnly: true },
);
