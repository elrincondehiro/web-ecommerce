import type { Context } from "@medusajs/framework/types";
import { InjectTransactionManager, MedusaContext, MedusaService } from "@medusajs/framework/utils";
import type { EntityManager } from "@medusajs/framework/mikro-orm/knex";
import { EMPTY_STATE, type PublishState as State } from "../../lib/storefront-publish";
import { PublishState } from "./models/publish-state";

const ID = "storefront";
const FIELDS = Object.keys(EMPTY_STATE) as (keyof State)[];

/**
 * Publicación del catálogo (rebuild del storefront, fase 13). `update(fn)` lee la fila con
 * `FOR UPDATE` dentro de una transacción y escribe el resultado de `fn`: un evento de catálogo y
 * el aviso del workflow a la vez no se pisan. Fuente: context7 /medusajs/medusa (db-operations:
 * `@InjectTransactionManager`, `manager.execute`).
 */
export default class StorefrontPublishModuleService extends MedusaService({ PublishState }) {
  async read(): Promise<State> {
    const [row] = await this.listPublishStates({ id: ID });
    return row ? pick(row) : { ...EMPTY_STATE };
  }

  @InjectTransactionManager()
  async update(
    fn: (s: State) => State,
    @MedusaContext() ctx?: Context<EntityManager>,
  ): Promise<State> {
    const m = ctx!.transactionManager!;
    await m.execute(
      `INSERT INTO storefront_publish_state (id, status) VALUES (?, 'idle') ON CONFLICT (id) DO NOTHING`,
      [ID],
    );
    const [row] = await m.execute(
      `SELECT * FROM storefront_publish_state WHERE id = ? FOR UPDATE`,
      [ID],
    );
    const next = fn(pick(row as Record<string, unknown>));
    await m.execute(
      `UPDATE storefront_publish_state SET ${FIELDS.map((f) => `${f} = ?`).join(", ")}, updated_at = now() WHERE id = ?`,
      [...FIELDS.map((f) => next[f]), ID],
    );
    return next;
  }
}

function pick(row: Record<string, unknown>): State {
  const date = (v: unknown) => (v ? new Date(v as string) : null);
  return {
    pending_since: date(row.pending_since),
    last_change_at: date(row.last_change_at),
    requested_at: date(row.requested_at),
    status: (row.status as State["status"]) ?? "idle",
    started_at: date(row.started_at),
    finished_at: date(row.finished_at),
    run_url: (row.run_url as string | null) ?? null,
    error: (row.error as string | null) ?? null,
  };
}
