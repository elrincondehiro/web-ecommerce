import { defineLink } from "@medusajs/framework/utils";
import OrderModule from "@medusajs/medusa/order";
import CajaModule from "../modules/caja";

/** Caja de snacks → pedido (Fase CS-3). Solo lectura: sin tabla de enlace (como las mascotas). */
export default defineLink(
  { linkable: CajaModule.linkable.caja.id, field: "order_id" },
  OrderModule.linkable.order,
  { readOnly: true },
);
