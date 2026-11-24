import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ExecArgs, MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { updateInventoryLevelsWorkflow } from "@medusajs/medusa/core-flows";
import { clearMedusaCache } from "./lib/clear-cache";
import { decodeUtf8 } from "./lib/csv";
import {
  finalLevels,
  planStock,
  readStockSheet,
  type StockMode,
  type StockVariant,
} from "./lib/stock-import";

/**
 * Carga de stock en masa desde una hoja (fase 13; catalog/plantilla/stock/LEEME.md).
 *
 *   pnpm --filter backend stock:import <fichero.csv> [fijar] [dry-run]
 *
 * Cada fila: `sku`, `ean` o `handle` (este solo para productos de una variante) + `stock` y, si
 * quieres, `modo` (`sumar` o `fijar`) por fila; vacío = el de la orden (`sumar`, o `fijar` si se
 * pasa). Granel: en gramos. Respeta lo reservado por pedidos en curso (avisa al fijar por debajo).
 * Con errores no escribe nada. Usa `updateInventoryLevelsWorkflow` (como `stock:mock`) y vacía la
 * caché de Medusa (AGENTS §4); el índice de búsqueda (`in_stock`) lo pone al día el job
 * `search-stock-sync` en ≤ 5 min. Nunca registra más que SKU/handle y cantidades.
 */
export default async function stockImport({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const dryRun = args.includes("dry-run");
  const mode: StockMode = args.includes("fijar") ? "fijar" : "sumar";
  const file = args.find((a) => !["dry-run", "fijar", "sumar"].includes(a));
  if (!file) {
    logger.error("Uso: stock:import <fichero.csv> [fijar] [dry-run]");
    return;
  }
  // Rutas relativas a apps/backend (donde corre `medusa exec`), como catalog:import.
  const full = path.resolve(file);
  const sheet = readStockSheet(decodeUtf8(await readFile(full)), mode);
  const plan = planStock(sheet.rows, await loadVariants(container));
  const errors = [...sheet.errors, ...plan.errors].sort((a, b) => a.line - b.line);
  const prefix = dryRun ? "[dry-run] " : "";

  for (const w of plan.warnings) logger.warn(`${prefix}línea ${w.line}: ${w.message}`);
  for (const c of plan.changes) {
    const name = c.variant.sku ?? c.variant.handle;
    const op = c.mode === "sumar" ? `+${c.quantity}` : `= ${c.quantity}`;
    logger.info(`${prefix}  ~ ${name}: ${c.before} → ${c.after} (${op})`);
  }
  if (errors.length) {
    for (const e of errors) logger.error(`línea ${e.line}: ${e.message}`);
    throw new Error(`stock:import: ${errors.length} errores en la hoja; no se ha cambiado nada.`);
  }
  const levels = finalLevels(plan.changes);
  logger.info(
    `${prefix}stock:import: ${levels.length} variantes cambian, ${plan.unchanged} sin cambios` +
      `, ${plan.warnings.length} avisos (modo por defecto: ${mode}).`,
  );
  if (dryRun || !levels.length) return;
  await updateInventoryLevelsWorkflow(container).run({ input: { updates: levels } });
  await clearMedusaCache(container);
  logger.info("stock:import: hecho. La búsqueda se pone al día en ≤ 5 min.");
}

/** Todas las variantes con su nivel de inventario en la (única) ubicación de la tienda. */
async function loadVariants(container: MedusaContainer): Promise<StockVariant[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const out: StockVariant[] = [];
  const PAGE = 200;
  for (let skip = 0; ; skip += PAGE) {
    const { data } = await query.graph({
      entity: "product",
      fields: [
        "handle",
        "variants.id",
        "variants.sku",
        "variants.ean",
        "variants.title",
        "variants.manage_inventory",
        "variants.inventory_items.inventory.location_levels.id",
        "variants.inventory_items.inventory.location_levels.inventory_item_id",
        "variants.inventory_items.inventory.location_levels.location_id",
        "variants.inventory_items.inventory.location_levels.stocked_quantity",
        "variants.inventory_items.inventory.location_levels.reserved_quantity",
      ],
      pagination: { skip, take: PAGE, order: { id: "ASC" } },
    });
    for (const p of data) {
      const variants = (p.variants ?? []).filter(Boolean);
      for (const v of variants) {
        const l = v!.inventory_items?.[0]?.inventory?.location_levels?.[0];
        out.push({
          id: v!.id,
          sku: v!.sku ?? null,
          ean: v!.ean ?? null,
          handle: p.handle,
          title: v!.title ?? "",
          siblings: variants.length,
          manageInventory: v!.manage_inventory !== false,
          level: l
            ? {
                id: l.id,
                inventoryItemId: l.inventory_item_id,
                locationId: l.location_id,
                stocked: Number(l.stocked_quantity),
                reserved: Number(l.reserved_quantity),
              }
            : null,
        });
      }
    }
    if (data.length < PAGE) break;
  }
  return out;
}
