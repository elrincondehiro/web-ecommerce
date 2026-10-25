import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { deletePetsWorkflow } from "../workflows/pets";

/**
 * Baja de la cuenta (Fase M): al borrar el cliente se borran sus mascotas y sus fotos del bucket.
 * Evento `customer.deleted` (CustomerWorkflowEvents.DELETED, @medusajs/utils 2.21.2: `{ id }`).
 */
export default async function petsCustomerDeleted({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  try {
    await deletePetsWorkflow(container).run({ input: { customer_id: data.id } });
  } catch (e) {
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn(`pets: no se pudieron borrar las mascotas del cliente ${data.id}: ${String(e)}`);
  }
}

export const config: SubscriberConfig = { event: "customer.deleted" };
