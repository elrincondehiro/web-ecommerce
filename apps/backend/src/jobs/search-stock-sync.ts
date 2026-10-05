import type { MedusaContainer } from "@medusajs/framework/types";
import { STOCK_SYNC_DEFAULT_CRON, syncStockToSearch } from "../lib/search-stock-sync";

/**
 * Cada `SEARCH_STOCK_SYNC_CRON` (por defecto cada 5 min) actualiza `in_stock` en el índice
 * de búsqueda de los productos cuyo stock o reservas cambiaron (D8 = L, fase 7).
 * Los scheduled jobs solo se ejecutan en modo worker/shared.
 */
export default async function searchStockSyncJob(container: MedusaContainer) {
  await syncStockToSearch(container);
}

export const config = {
  name: "search-stock-sync",
  schedule: process.env.SEARCH_STOCK_SYNC_CRON || STOCK_SYNC_DEFAULT_CRON,
};
