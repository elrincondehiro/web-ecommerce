import { defineLink } from "@medusajs/framework/utils";
import CustomerModule from "@medusajs/medusa/customer";
import StockAlertModule from "../modules/stock-alert";

/** Aviso de stock → cliente (Fase MK-B). Solo lectura: sin tabla de enlace. */
export default defineLink(
  { linkable: StockAlertModule.linkable.stockAlert.id, field: "customer_id" },
  CustomerModule.linkable.customer,
  { readOnly: true },
);
