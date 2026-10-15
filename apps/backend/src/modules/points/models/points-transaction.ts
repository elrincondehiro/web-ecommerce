import { model } from "@medusajs/framework/utils";
import { PointsAccount } from "./points-account";

/**
 * Movimiento de puntos (Fase L-2). `amount` > 0 en € (1 punto = 1 €); `type` decide el signo.
 * `reference` + `reference_id` dicen qué lo originó (lib/points.ts REF: order, order_redeem…) y
 * son ÚNICOS por tipo → idempotencia (un abono por pedido, un canje por pedido…).
 * `channel`: "web" (la tienda física irá con el suyo cuando el POS use este Medusa, M2).
 * G6: los movimientos se conservan ≥ 4 años aunque se dé de baja la cuenta (sin cascada).
 */
export const PointsTransaction = model
  .define("points_transaction", {
    id: model.id({ prefix: "pts_trx" }).primaryKey(),
    type: model.enum(["credit", "debit"]),
    amount: model.bigNumber(),
    reference: model.text(),
    reference_id: model.text(),
    channel: model.text().default("web"),
    note: model.text().nullable(),
    account: model.belongsTo(() => PointsAccount, { mappedBy: "transactions" }),
    metadata: model.json().nullable(),
  })
  .indexes([
    {
      name: "IDX_points_transaction_reference_unique",
      on: ["reference", "reference_id", "type"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ]);
