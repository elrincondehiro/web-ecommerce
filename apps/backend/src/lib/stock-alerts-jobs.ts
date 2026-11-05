import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { dueAlerts, groupByCustomer, stockAlertTtlDays } from "./stock-alerts";
import { availableUnits, variantsInfo, waitingAlerts } from "./stock-alerts-data";
import { STOCK_ALERT_MODULE } from "../modules/stock-alert";
import type StockAlertModuleService from "../modules/stock-alert/service";
import { deleteStockAlertsWorkflow, fulfillStockAlertsWorkflow } from "../workflows/stock-alerts";

/**
 * Jobs de los avisos de stock (Fase MK-B), en el worker:
 * - `checkStockAlerts` (cada `STOCK_ALERT_CRON`, 5 min): mira SOLO las variantes que alguien
 *   espera (pocas) y, si tienen stock, cumple sus avisos (un evento por cliente → un email).
 *   Nada en el request ni en cada pedido (AGENTS §4: trabajo pesado en jobs).
 * - `expireStockAlerts` (a diario): borra los que llevan más de `STOCK_ALERT_TTL_DAYS` sin
 *   cumplirse y los ya avisados que quedaran (si el email falló a medias).
 */
export async function checkStockAlerts(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const alerts = await waitingAlerts(container);
  if (!alerts.length) return { checked: 0, fulfilled: 0 };
  const infos = await variantsInfo(container, [...new Set(alerts.map((a) => a.variant_id))]);
  const available = await availableUnits(container, infos);
  const { due, restocks } = dueAlerts(alerts, available);
  let fulfilled = 0;
  for (const [customer_id, list] of groupByCustomer(due)) {
    try {
      await fulfillStockAlertsWorkflow(container).run({
        input: {
          customer_id,
          alerts: list,
          restocks: list.map((a) => restocks.get(a.variant_id)!),
        },
      });
      fulfilled += list.length;
    } catch (err) {
      logger.warn(
        `[stock-alerts] no se pudieron cumplir los avisos de ${customer_id}: ${String(err)}`,
      );
    }
  }
  if (fulfilled)
    logger.info(`[stock-alerts] ${fulfilled} avisos cumplidos (${restocks.size} variantes).`);
  return { checked: alerts.length, fulfilled };
}

export async function expireStockAlerts(container: MedusaContainer, now = new Date()) {
  const svc = container.resolve<StockAlertModuleService>(STOCK_ALERT_MODULE);
  const days = stockAlertTtlDays(process.env.STOCK_ALERT_TTL_DAYS);
  const limit = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [old, notified] = await Promise.all([
    svc.listStockAlerts({ notified_at: null, created_at: { $lt: limit } }, { select: ["id"] }),
    svc.listStockAlerts({ notified_at: { $lt: dayAgo } }, { select: ["id"] }),
  ]);
  const ids = [...old, ...notified].map((r) => r.id);
  if (ids.length) await deleteStockAlertsWorkflow(container).run({ input: { ids } });
  return { expired: old.length, cleaned: notified.length };
}
