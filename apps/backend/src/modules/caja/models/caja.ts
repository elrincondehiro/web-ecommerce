import { model } from "@medusajs/framework/utils";
import { CAJA_ESTADOS } from "../../../lib/caja";

/**
 * Caja de snacks de un pedido (Fase CS-3, docs/fases/faseCS-caja-snacks.md). Una por línea de
 * caja (`line_item_id`, cantidad 1 siempre): la crea el subscriber de `order.placed`.
 * - `estado` (lib/caja.ts): `pendiente` → `rellena` (invisible para el cliente) → `propuesta`
 *   (email con enlace de un solo uso) → `aceptada` | `aceptada_auto` (24 h) | `rechazada` (se
 *   vuelve a rellenar y a proponer a mano).
 * - `intento`: veces que se ha guardado el contenido (cada vez se rehace por completo).
 * - El contenido son líneas del pedido a 0 € con `metadata.caja_de = line_item_id`.
 */
export const Caja = model
  .define("caja", {
    id: model.id({ prefix: "caja" }).primaryKey(),
    order_id: model.text(),
    line_item_id: model.text(),
    estado: model.enum([...CAJA_ESTADOS]).default("pendiente"),
    intento: model.number().default(0),
    rellenada_at: model.dateTime().nullable(),
    // CS-4: propuesta al cliente
    /** SHA-256 del token del enlace (el token solo va en el email); null = ya respondida. */
    token_hash: model.text().nullable(),
    propuesta_at: model.dateTime().nullable(),
    respondida_at: model.dateTime().nullable(),
    /** «¿Qué no le gusta?» del rechazo (texto libre del cliente, ≤ 500). */
    motivo_rechazo: model.text().nullable(),
    /** Aviso interno de 48 h laborables ya enviado (desde el pedido o el último rechazo). */
    aviso_at: model.dateTime().nullable(),
    metadata: model.json().nullable(),
  })
  .indexes([
    { on: ["order_id"], where: "deleted_at IS NULL" },
    { on: ["line_item_id"], unique: true, where: "deleted_at IS NULL" },
    { on: ["estado"], where: "deleted_at IS NULL" },
  ]);
