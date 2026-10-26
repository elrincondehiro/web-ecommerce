import type { MedusaContainer } from "@medusajs/framework/types";
import { TRANSFER_DEFAULT_CRON } from "../lib/transfer";
import { processTransferOrders } from "../lib/transfer-orders";

/**
 * Cada `TRANSFER_CANCEL_CRON` (por defecto a diario a las 9:00): recordatorio el último día para
 * pagar una transferencia y cancelación al día siguiente (Fase PG-3, lib/transfer-orders.ts).
 */
export default async function transferOrdersJob(container: MedusaContainer) {
  await processTransferOrders(container);
}

export const config = {
  name: "transfer-orders",
  schedule: process.env.TRANSFER_CANCEL_CRON || TRANSFER_DEFAULT_CRON,
};
