import type { MedusaContainer } from "@medusajs/framework/types";
import { STOCK_ALERT_EXPIRE_DEFAULT_CRON } from "../lib/stock-alerts";
import { expireStockAlerts } from "../lib/stock-alerts-jobs";

/** Avisos de stock (Fase MK-B): caducidad (`STOCK_ALERT_TTL_DAYS`). Solo en el worker. */
export default async function stockAlertsExpireJob(container: MedusaContainer) {
  await expireStockAlerts(container);
}

export const config = {
  name: "stock-alerts-expire",
  schedule: process.env.STOCK_ALERT_EXPIRE_CRON || STOCK_ALERT_EXPIRE_DEFAULT_CRON,
};
