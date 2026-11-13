import { model } from "@medusajs/framework/utils";
import { PUBLISH_STATUSES } from "../../../lib/storefront-publish";

/**
 * Estado de la publicación del catálogo en la tienda (rebuild del storefront, fase 13). UNA sola
 * fila (id `storefront`): cambios pendientes, «publicar ahora» del Admin y la última publicación.
 */
export const PublishState = model.define("storefront_publish_state", {
  id: model.id().primaryKey(),
  pending_since: model.dateTime().nullable(),
  last_change_at: model.dateTime().nullable(),
  requested_at: model.dateTime().nullable(),
  status: model.enum([...PUBLISH_STATUSES]).default("idle"),
  started_at: model.dateTime().nullable(),
  finished_at: model.dateTime().nullable(),
  run_url: model.text().nullable(),
  error: model.text().nullable(),
});
