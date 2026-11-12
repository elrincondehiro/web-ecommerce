import { defineLink } from "@medusajs/framework/utils";
import CustomerModule from "@medusajs/medusa/customer";
import CommsModule from "../modules/comms";

/** Consentimiento → cliente (Fase MK-A). Solo lectura: sin tabla de enlace (como `pets`). */
export default defineLink(
  { linkable: CommsModule.linkable.commsConsent.id, field: "customer_id" },
  CustomerModule.linkable.customer,
  { readOnly: true },
);
