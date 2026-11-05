import type { MedusaContainer } from "@medusajs/framework/types";
import { STOCK_ALERT_DEFAULT_CRON } from "../lib/stock-alerts";
import { checkStockAlerts } from "../lib/stock-alerts-jobs";

/** Avisos de stock (Fase MK-B): cumple los de las variantes que han vuelto. Solo en el worker. */
export default async function stockAlertsJob(container: MedusaContainer) {
  await checkStockAlerts(container);
}

export const config = {
  name: "stock-alerts",
  schedule: process.env.STOCK_ALERT_CRON || STOCK_ALERT_DEFAULT_CRON,
};
