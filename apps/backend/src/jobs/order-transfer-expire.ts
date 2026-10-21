import type { MedusaContainer } from "@medusajs/framework/types";
import { ORDER_TRANSFER_EXPIRE_DEFAULT_CRON } from "../lib/guest-orders";
import { expireOrderTransfers } from "../lib/guest-orders-claim";

/**
 * Cada `ORDER_TRANSFER_EXPIRE_CRON` (por defecto a diario a las 4:15) cancela las solicitudes de
 * transferencia pendientes de más de `ORDER_TRANSFER_TTL_DAYS` días (7): mientras están
 * pendientes, el pedido no admite devoluciones ni ediciones (Fase G-2, spike G-0).
 */
export default async function orderTransferExpireJob(container: MedusaContainer) {
  await expireOrderTransfers(container);
}

export const config = {
  name: "order-transfer-expire",
  schedule: process.env.ORDER_TRANSFER_EXPIRE_CRON || ORDER_TRANSFER_EXPIRE_DEFAULT_CRON,
};
