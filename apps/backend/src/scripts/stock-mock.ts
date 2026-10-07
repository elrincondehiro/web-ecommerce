/**
 * Repone el stock de los productos mock (handle `mock-*`) — idempotente, solo desarrollo.
 *
 *   pnpm --filter backend stock:mock            # libre < 10 → libre = 50
 *   STOCK_MIN=5 STOCK_TARGET=30 pnpm --filter backend stock:mock
 *
 * Los e2e de checkout crean pedidos reales en la BD local: sus reservas van gastando el stock
 * libre (stocked − reserved) de los productos de prueba y, con < 3 libres, `carrito.spec.ts`
 * falla con `#carrito-stock`. Este script sube `stocked_quantity` para que queden STOCK_TARGET
 * libres. No toca reservas ni pedidos; los productos sin stock a propósito del seed (stocked 0)
 * se dejan igual. Usa `updateInventoryLevelsWorkflow` (core-flows 2.21.2), no SQL. El índice de
 * búsqueda (`in_stock`) lo actualiza el job `search-stock-sync` en ≤ 5 min.
 */
import type { ExecArgs, UpdateInventoryLevelInput } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { updateInventoryLevelsWorkflow } from "@medusajs/medusa/core-flows";

const MIN = Number(process.env.STOCK_MIN ?? 10);
const TARGET = Number(process.env.STOCK_TARGET ?? 50);

export default async function stockMock({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  if (!(TARGET > MIN && MIN >= 0)) throw new Error("STOCK_TARGET debe ser mayor que STOCK_MIN ≥ 0");

  const { data: products } = await query.graph({
    entity: "product",
    fields: ["handle", "variants.inventory_items.inventory.location_levels.*"],
    filters: { handle: { $like: "mock-%" } },
  });

  const updates: UpdateInventoryLevelInput[] = [];
  for (const p of products) {
    for (const v of p.variants ?? []) {
      for (const link of v?.inventory_items ?? []) {
        for (const l of link?.inventory?.location_levels ?? []) {
          if (!l || l.stocked_quantity === 0) continue; // sin stock a propósito (seed)
          const free = l.stocked_quantity - l.reserved_quantity;
          if (free >= MIN) continue;
          updates.push({
            id: l.id,
            inventory_item_id: l.inventory_item_id,
            location_id: l.location_id,
            stocked_quantity: l.reserved_quantity + TARGET,
          });
        }
      }
    }
  }

  if (!updates.length) {
    logger.info(`stock:mock: nada que reponer (todos con ≥ ${MIN} libres)`);
    return;
  }
  await updateInventoryLevelsWorkflow(container).run({ input: { updates } });
  logger.info(`stock:mock: ${updates.length} niveles repuestos a ${TARGET} libres`);
}
