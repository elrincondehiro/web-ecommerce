import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { SEARCH_LOGGED, weekStart, type SearchLoggedData } from "../lib/search-log";
import { SEARCH_LOG_MODULE } from "../modules/search-log";
import type SearchLogModuleService from "../modules/search-log/service";

/** Búsquedas (Fase MK-E2): suma la búsqueda a su término y semana (en el worker). */
export default async function searchLogged({
  event: { data },
  container,
}: SubscriberArgs<SearchLoggedData>) {
  await container
    .resolve<SearchLogModuleService>(SEARCH_LOG_MODULE)
    .record(data.term, weekStart(new Date()), data.total);
}

export const config: SubscriberConfig = { event: SEARCH_LOGGED };
