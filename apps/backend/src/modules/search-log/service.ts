import type { Context } from "@medusajs/framework/types";
import type { EntityManager } from "@medusajs/framework/mikro-orm/knex";
import {
  InjectManager,
  MedusaContext,
  MedusaService,
  generateEntityId,
} from "@medusajs/framework/utils";
import type { SearchTermRow } from "../../lib/search-log";
import { SearchTerm } from "./models/search-term";

/**
 * Búsquedas (Fase MK-E2). Suma con un único `INSERT … ON CONFLICT DO UPDATE` (atómico: dos
 * búsquedas a la vez no pierden ninguna). Fuente: context7 /medusajs/medusa (db-operations:
 * `@InjectManager` + `manager.execute`). Parámetros con `?` (knex), nunca concatenados.
 */
export default class SearchLogModuleService extends MedusaService({ SearchTerm }) {
  @InjectManager()
  async record(
    term: string,
    week: string,
    total: number,
    @MedusaContext() ctx?: Context<EntityManager>,
  ): Promise<void> {
    await ctx!.manager!.execute(
      `INSERT INTO search_term (id, term, week, count, zero_count, last_total)
       VALUES (?, ?, ?::timestamptz, 1, ?, ?)
       ON CONFLICT (term, week) WHERE deleted_at IS NULL DO UPDATE SET
         count = search_term.count + 1,
         zero_count = search_term.zero_count + EXCLUDED.zero_count,
         last_total = EXCLUDED.last_total,
         updated_at = now()`,
      [generateEntityId(undefined, "srch"), term, week, total === 0 ? 1 : 0, total],
    );
  }

  /** Términos del periodo (desde la semana `since`), de más a menos buscados. */
  @InjectManager()
  async summary(
    since: string,
    @MedusaContext() ctx?: Context<EntityManager>,
  ): Promise<SearchTermRow[]> {
    const rows: {
      term: string;
      count: string;
      zero: string;
      last_total: number;
      last_week: Date;
    }[] = await ctx!.manager!.execute(
      `SELECT term, SUM(count) AS count, SUM(zero_count) AS zero,
              (ARRAY_AGG(last_total ORDER BY week DESC))[1] AS last_total, MAX(week) AS last_week
       FROM search_term
       WHERE deleted_at IS NULL AND week >= ?::timestamptz
       GROUP BY term
       ORDER BY SUM(count) DESC, term`,
      [since],
    );
    return rows.map((r) => ({
      term: r.term,
      count: Number(r.count),
      zero: Number(r.zero),
      last_total: Number(r.last_total),
      last_week: new Date(r.last_week).toISOString().slice(0, 10),
    }));
  }

  /** Borra (de verdad: no hay nada que recuperar) lo anterior a la semana `before`. */
  @InjectManager()
  async purge(before: string, @MedusaContext() ctx?: Context<EntityManager>): Promise<number> {
    const res: { n: string }[] = await ctx!.manager!.execute(
      `WITH d AS (DELETE FROM search_term WHERE week < ?::timestamptz RETURNING 1)
       SELECT COUNT(*) AS n FROM d`,
      [before],
    );
    return Number(res[0]?.n ?? 0);
  }
}
