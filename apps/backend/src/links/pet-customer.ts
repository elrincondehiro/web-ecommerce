import { defineLink } from "@medusajs/framework/utils";
import CustomerModule from "@medusajs/medusa/customer";
import PetsModule from "../modules/pets";

/** Mascota → cliente (Fase M). Solo lectura: sin tabla de enlace (como la lista de deseos). */
export default defineLink(
  { linkable: PetsModule.linkable.pet.id, field: "customer_id" },
  CustomerModule.linkable.customer,
  { readOnly: true },
);
