import { model } from "@medusajs/framework/utils";

/**
 * Contador de búsquedas (Fase MK-E2): un término normalizado en una semana (lunes UTC). Sin
 * nada personal. `last_total`: resultados la última vez (para ver si un término ya encuentra algo).
 * Se borra a las 52 semanas (job `search-log-purge`).
 */
export const SearchTerm = model
  .define("search_term", {
    id: model.id({ prefix: "srch" }).primaryKey(),
    term: model.text(),
    week: model.dateTime(),
    count: model.number().default(0),
    zero_count: model.number().default(0),
    last_total: model.number().default(0),
  })
  .indexes([{ on: ["term", "week"], unique: true }, { on: ["week"] }]);
