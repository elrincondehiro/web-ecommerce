import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { SEARCH_LOG_PURGE_DEFAULT_CRON, SEARCH_LOG_WEEKS, weekStart } from "../lib/search-log";
import { SEARCH_LOG_MODULE } from "../modules/search-log";
import type SearchLogModuleService from "../modules/search-log/service";

/** Búsquedas (Fase MK-E2): borra los contadores de hace más de 52 semanas. Solo en el worker. */
export default async function searchLogPurgeJob(container: MedusaContainer) {
  const before = weekStart(new Date(Date.now() - SEARCH_LOG_WEEKS * 7 * 86_400_000));
  const n = await container.resolve<SearchLogModuleService>(SEARCH_LOG_MODULE).purge(before);
  if (n)
    container.resolve(ContainerRegistrationKeys.LOGGER).info(`search-log: ${n} filas borradas`);
}

export const config = {
  name: "search-log-purge",
  schedule: process.env.SEARCH_LOG_PURGE_CRON || SEARCH_LOG_PURGE_DEFAULT_CRON,
};
