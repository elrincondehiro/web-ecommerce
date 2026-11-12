import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { SEARCH_LOG_PERIODS, searchTermsCsv, weekStart } from "../../../lib/search-log";
import { SEARCH_LOG_MODULE } from "../../../modules/search-log";
import type SearchLogModuleService from "../../../modules/search-log/service";

/**
 * GET /admin/search-terms?dias=30[&formato=csv] (Fase MK-E2): búsquedas del periodo (desde el
 * lunes de la semana de hace `dias` días), de más a menos buscadas. `formato=csv`: descarga.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const raw = Number(req.query.dias);
  const days = (SEARCH_LOG_PERIODS as readonly number[]).includes(raw) ? raw : 30;
  const since = weekStart(new Date(Date.now() - days * 86_400_000));
  const rows = await req.scope.resolve<SearchLogModuleService>(SEARCH_LOG_MODULE).summary(since);
  if (req.query.formato === "csv") {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="busquedas-${days}d-${since}.csv"`);
    res.send(searchTermsCsv(rows));
    return;
  }
  // Enlace «ver en la tienda» de cada término (la misma URL que usan los emails).
  const store_url = process.env.STOREFRONT_URL?.replace(/\/+$/, "") || null;
  res.json({ since, days, rows, store_url });
}
