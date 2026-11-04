import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { deleteCommsConsentsWorkflow } from "../workflows/comms";

/**
 * Baja de la cuenta (Fase MK-A): al borrar el cliente se borran sus consentimientos de
 * comunicaciones. Evento `customer.deleted` (`{ id }`), como `pets-customer-deleted`.
 */
export default async function commsCustomerDeleted({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  try {
    await deleteCommsConsentsWorkflow(container).run({ input: { customer_id: data.id } });
  } catch (e) {
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn(
        `comms: no se pudieron borrar los consentimientos del cliente ${data.id}: ${String(e)}`,
      );
  }
}

export const config: SubscriberConfig = { event: "customer.deleted" };
