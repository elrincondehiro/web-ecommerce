import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { deleteStockAlertsWorkflow } from "../workflows/stock-alerts";

/** Baja de la cuenta (Fase MK-B): al borrar el cliente se borran sus avisos de stock. */
export default async function stockAlertsCustomerDeleted({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  try {
    await deleteStockAlertsWorkflow(container).run({ input: { customer_id: data.id } });
  } catch (e) {
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn(`stock-alerts: no se pudieron borrar los avisos del cliente ${data.id}: ${String(e)}`);
  }
}

export const config: SubscriberConfig = { event: "customer.deleted" };
