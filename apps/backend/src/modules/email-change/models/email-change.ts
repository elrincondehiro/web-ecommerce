import { model } from "@medusajs/framework/utils";

/**
 * Solicitud de cambio de email de una cuenta (fase 13 punto 8, docs/fases/fase13-cuenta.md §2.6).
 * El token del enlace (enviado al email NUEVO) solo se guarda como hash; caduca a las 24 h y es
 * de un solo uso (`used_at`). Una solicitud nueva del mismo cliente anula las anteriores.
 */
export const EmailChange = model
  .define("email_change", {
    id: model.id({ prefix: "emch" }).primaryKey(),
    customer_id: model.text(),
    new_email: model.text(),
    token_hash: model.text(),
    expires_at: model.dateTime(),
    used_at: model.dateTime().nullable(),
  })
  .indexes([
    { on: ["token_hash"], unique: true, where: "deleted_at IS NULL" },
    { on: ["customer_id"] },
  ]);
