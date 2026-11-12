import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  SEARCH_LOGGED,
  SEARCH_LOG_HEADER,
  normalizeSearchTerm,
  type SearchLoggedData,
} from "./search-log";

type Body = { queries?: { filters?: { q?: unknown } }[]; filters?: { q?: unknown } };
type Result = { results?: { metadata?: { count?: number } }[] };

/**
 * `POST /store/search` (Fase MK-E2): con la cabecera `x-search-log: 1` (búsqueda limpia de
 * /buscar/, la manda el storefront), al responder emite `search.logged` con el término y el
 * total de la PRIMERA consulta. No cambia la respuesta ni la retrasa: el recuento lo hace el
 * subscriber en el worker. Sin la cabecera (sugerencias, filtros, páginas) no hace nada.
 */
export function logSearch(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  if (req.get(SEARCH_LOG_HEADER) !== "1") return next();
  const body = req.body as Body | undefined;
  const q = (body?.queries?.[0] ?? body)?.filters?.q;
  const term = typeof q === "string" ? normalizeSearchTerm(q) : null;
  if (!term) return next();
  const json = res.json.bind(res);
  res.json = (data: unknown) => {
    const total = (data as Result | undefined)?.results?.[0]?.metadata?.count;
    if (res.statusCode < 400 && typeof total === "number") {
      const payload: SearchLoggedData = { term, total };
      req.scope
        .resolve(Modules.EVENT_BUS)
        .emit({ name: SEARCH_LOGGED, data: payload })
        .catch((e: unknown) =>
          req.scope
            .resolve(ContainerRegistrationKeys.LOGGER)
            .warn(`search-log: no se ha podido emitir (${String(e)})`),
        );
    }
    return json(data);
  };
  next();
}
