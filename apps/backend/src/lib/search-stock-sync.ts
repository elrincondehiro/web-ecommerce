import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";

/**
 * Sincroniza `in_stock` del índice `product` por LOTES (decisión D8 = L, fase 7).
 *
 * En vez de reindexar un producto con cada evento de stock o de reserva (cada pedido crea y
 * borra reservas), un scheduled job recoge cada X minutos los `inventory_level` y
 * `reservation_item` que cambiaron desde la pasada anterior, saca los productos SIN repetir
 * y llama a `reindex` con `filters: { id }`. Eso reindexa solo esos documentos, sobre la versión
 * activa (sin swap). Fuente: @medusajs/search 2.21.2 `utils/seeding.js` (`scoped` → in place)
 * y llms-full.txt (Reindexing and Migrations → Seeding on Demand; Scheduled Jobs).
 *
 * Vive en `src/lib` (no en `src/search`): el cargador de índices lee `src/search` recursivo.
 */

export const STOCK_SYNC_DEFAULT_CRON = "*/5 * * * *";
const CURSOR_KEY = "search:stock-sync:cursor";
/** Si no hay marca (primera pasada o Redis vaciado), cuánto mirar hacia atrás. */
export const STOCK_SYNC_FALLBACK_MS = 60 * 60 * 1000;
/** Solape con la pasada anterior: cubre transacciones que confirmaron justo en el corte. */
export const STOCK_SYNC_OVERLAP_MS = 60 * 1000;
const CURSOR_TTL_S = 30 * 24 * 60 * 60;
const BATCH = 500;

type Row = Record<string, unknown>;

/** Desde cuándo mirar: la marca anterior menos el solape, o el margen por defecto. */
export function computeSince(cursor: string | null | undefined, now: Date): Date {
  const parsed = cursor ? Date.parse(cursor) : Number.NaN;
  const base = Number.isFinite(parsed) ? parsed : now.getTime() - STOCK_SYNC_FALLBACK_MS;
  return new Date(Math.min(base, now.getTime()) - STOCK_SYNC_OVERLAP_MS);
}

/** Ids de inventory item de filas de nivel o reserva, sin repetir. */
export function inventoryItemIds(rows: Row[]): string[] {
  return [
    ...new Set(
      rows.map((r) => r.inventory_item_id).filter((id): id is string => typeof id === "string"),
    ),
  ];
}

/** Ids de producto de filas `inventory_item` con `variants.product_id`, sin repetir. */
export function productIdsFromItems(rows: Row[]): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    for (const v of (row.variants as ({ product_id?: string } | null)[] | undefined) ?? []) {
      if (v?.product_id) ids.add(v.product_id);
    }
  }
  return [...ids];
}

const changedSince = (since: Date) => ({
  $or: [{ updated_at: { $gte: since } }, { deleted_at: { $gte: since } }],
});

export async function syncStockToSearch(container: MedusaContainer, now = new Date()) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const cache = container.resolve(Modules.CACHING);
  const searchModule = container.resolve(Modules.SEARCH);

  const since = computeSince((await cache.get({ key: CURSOR_KEY }))?.at as string | undefined, now);

  const [levels, reservations] = await Promise.all(
    ["inventory_level", "reservation_item"].map((entity) =>
      query.graph({
        entity,
        fields: ["inventory_item_id"],
        filters: changedSince(since),
        withDeleted: true,
      }),
    ),
  );
  const itemIds = inventoryItemIds([
    ...((levels?.data ?? []) as Row[]),
    ...((reservations?.data ?? []) as Row[]),
  ]);

  let productIds: string[] = [];
  for (let i = 0; i < itemIds.length; i += BATCH) {
    const { data } = await query.graph({
      entity: "inventory_item",
      fields: ["id", "variants.product_id"],
      filters: { id: itemIds.slice(i, i + BATCH) },
      withDeleted: true,
    });
    productIds = [...new Set([...productIds, ...productIdsFromItems(data as Row[])])];
  }

  for (let i = 0; i < productIds.length; i += BATCH) {
    await searchModule.reindex({
      index: "product",
      filters: { id: productIds.slice(i, i + BATCH) },
    });
  }

  // La marca solo avanza si todo lo anterior fue bien: si algo falla, la próxima pasada
  // vuelve a recoger estos cambios.
  await cache.set({ key: CURSOR_KEY, data: { at: now.toISOString() }, ttl: CURSOR_TTL_S });
  if (productIds.length) {
    logger.info(
      `[stock-sync] ${productIds.length} productos reindexados (${itemIds.length} inventory items cambiados desde ${since.toISOString()}).`,
    );
  }
  return { since, inventoryItems: itemIds.length, products: productIds.length };
}
