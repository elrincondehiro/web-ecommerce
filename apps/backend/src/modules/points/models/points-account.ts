import { model } from "@medusajs/framework/utils";
import { PointsTransaction } from "./points-transaction";

/**
 * Cuenta de puntos (Fase L-2): una por cliente. El saldo NO se guarda: es Σ abonos − Σ cargos de
 * sus movimientos (como el Store Credit de Medusa; auditable). Patrón del tutorial oficial
 * `loyalty-points` (context7 /medusajs/medusa), con movimientos en vez de un saldo mutable.
 */
export const PointsAccount = model
  .define("points_account", {
    id: model.id({ prefix: "pts_acc" }).primaryKey(),
    customer_id: model.text(),
    transactions: model.hasMany(() => PointsTransaction, { mappedBy: "account" }),
    metadata: model.json().nullable(),
  })
  .indexes([{ on: ["customer_id"], unique: true, where: "deleted_at IS NULL" }]);
