import { writeFile } from "node:fs/promises";
import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { waitingCsv } from "../lib/stock-alerts";
import { stockAlertsSummary } from "../lib/stock-alerts-summary";

/**
 * Lista de espera de los avisos de stock (Fase MK-B) desde la terminal: por variante, cuántos
 * clientes esperan, desde cuándo y lo que hay ahora a la venta. Sin datos de los clientes.
 *
 *   pnpm --filter backend stock-alerts:list          # tabla
 *   pnpm --filter backend stock-alerts:list csv lista.csv   # CSV (;) para una hoja de cálculo
 */
export default async function stockAlertsList({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const rows = await stockAlertsSummary(container);
  if (args[0] === "csv") {
    const file = args[1] || "avisos-stock.csv";
    await writeFile(file, `${waitingCsv(rows)}\n`, "utf8");
    logger.info(`stock-alerts:list: ${rows.length} variantes en ${file}.`);
    return;
  }
  if (!rows.length) {
    logger.info("stock-alerts:list: nadie espera ningún producto.");
    return;
  }
  const total = rows.reduce((n, r) => n + r.waiting, 0);
  logger.info(`stock-alerts:list: ${rows.length} variantes, ${total} avisos.`);
  for (const r of rows) {
    const variant = r.variant_title ? ` · ${r.variant_title}` : "";
    const sku = r.sku ? ` [${r.sku}]` : "";
    const sale = r.available === null ? "sin límite" : `${r.available} a la venta`;
    logger.info(
      `  ${String(r.waiting).padStart(3)} esperando · ${r.product_title}${variant}${sku} · ${sale} · desde ${r.oldest.slice(0, 10)}`,
    );
  }
}
