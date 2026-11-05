import type { MedusaContainer } from "@medusajs/framework/types";
import { waitingSummary } from "./stock-alerts";
import { availableUnits, namesOf, variantsInfo, waitingAlerts } from "./stock-alerts-data";

/**
 * Lista de espera (Fase MK-B): por variante, cuántos clientes esperan, desde cuándo y lo que hay
 * ahora a la venta. Para la página del Admin, el widget del producto y `stock-alerts:list`.
 */
export async function stockAlertsSummary(container: MedusaContainer, productId?: string) {
  const all = await waitingAlerts(container);
  const alerts = productId ? all.filter((a) => a.product_id === productId) : all;
  const infos = await variantsInfo(container, [...new Set(alerts.map((a) => a.variant_id))]);
  const available = await availableUnits(container, infos);
  return waitingSummary(alerts, namesOf(infos)).map((r) => {
    const units = available.get(r.variant_id) ?? 0;
    return { ...r, available: Number.isFinite(units) ? units : null };
  });
}
