import { defineLink } from "@medusajs/framework/utils";
import CustomerModule from "@medusajs/medusa/customer";
import PointsModule from "../modules/points";

/** Cuenta de puntos → cliente (Fase L-2). Solo lectura: sin tabla de enlace. */
export default defineLink(
  { linkable: PointsModule.linkable.pointsAccount.id, field: "customer_id" },
  CustomerModule.linkable.customer,
  { readOnly: true },
);
