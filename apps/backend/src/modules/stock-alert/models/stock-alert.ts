import { model } from "@medusajs/framework/utils";

/**
 * Aviso de stock (Fase MK-B): un cliente con cuenta pide que le avisemos cuando vuelva una
 * variante agotada. Uno activo como mucho por cliente y variante (`STOCK_ALERT_MAX_PER_CUSTOMER`
 * por cliente). Al cumplirse se envía UN email y se borra (suave); los que no se cumplen en
 * `STOCK_ALERT_TTL_DAYS` días también. Al borrar el cliente se borran los suyos.
 * Enlaces de solo lectura con el cliente y la variante (src/links/stock-alert-*.ts).
 */
export const StockAlert = model
  .define("stock_alert", {
    id: model.id({ prefix: "sta" }).primaryKey(),
    customer_id: model.text(),
    product_id: model.text(),
    variant_id: model.text(),
    /** Cuándo se envió el aviso (null = esperando). Se borra justo después. */
    notified_at: model.dateTime().nullable(),
  })
  .indexes([
    { on: ["customer_id"], where: "deleted_at IS NULL" },
    { on: ["variant_id"], where: "deleted_at IS NULL" },
    { on: ["customer_id", "variant_id"], unique: true, where: "deleted_at IS NULL" },
  ]);
