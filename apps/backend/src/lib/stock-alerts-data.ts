import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, getVariantAvailability } from "@medusajs/framework/utils";
import { bulkRule } from "./granel";
import { variantLabel, type AlertRow } from "./stock-alerts";
import { STOCK_ALERT_MODULE } from "../modules/stock-alert";
import type StockAlertModuleService from "../modules/stock-alert/service";

/**
 * Datos de los avisos de stock (Fase MK-B): disponibilidad de las variantes esperadas y nombres
 * para el email, el Admin y el script. Disponibilidad con el criterio de la tienda (lo mismo que
 * `in_stock` del índice y `lib/catalog.ts` del storefront): stock − reservas en los almacenes del
 * canal (`getVariantAvailability`, context7 /medusajs/medusa, «Retrieve Product Variant
 * Inventory»). Sin gestionar inventario o admitiendo pedidos sin stock = ilimitado. Granel: las
 * unidades son pasos; hay stock si caben los del mínimo, y se cuentan «pedidos mínimos».
 */
type Row = Record<string, unknown>;
const service = (c: MedusaContainer) => c.resolve<StockAlertModuleService>(STOCK_ALERT_MODULE);
const BATCH = 500;

export type VariantInfo = {
  id: string;
  title: string | null;
  sku: string | null;
  manage_inventory: boolean;
  allow_backorder: boolean;
  metadata: Record<string, unknown> | null;
  product: {
    id: string;
    title: string;
    handle: string;
    status: string;
    thumbnail: string | null;
    metadata: Record<string, unknown> | null;
    sales_channel_ids: string[];
  } | null;
};

export async function variantsInfo(
  container: MedusaContainer,
  ids: string[],
): Promise<Map<string, VariantInfo>> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const out = new Map<string, VariantInfo>();
  for (let i = 0; i < ids.length; i += BATCH) {
    const { data } = await query.graph({
      entity: "product_variant",
      fields: [
        "id",
        "title",
        "sku",
        "manage_inventory",
        "allow_backorder",
        "metadata",
        "product.id",
        "product.title",
        "product.handle",
        "product.status",
        "product.thumbnail",
        "product.metadata",
        "product.sales_channels.id",
      ],
      filters: { id: ids.slice(i, i + BATCH) },
    });
    for (const v of data as Row[]) {
      const p = v.product as Row | null;
      out.set(v.id as string, {
        id: v.id as string,
        title: (v.title as string | null) ?? null,
        sku: (v.sku as string | null) ?? null,
        manage_inventory: v.manage_inventory !== false,
        allow_backorder: Boolean(v.allow_backorder),
        metadata: (v.metadata as Record<string, unknown> | null) ?? null,
        product: p
          ? {
              id: p.id as string,
              title: p.title as string,
              handle: p.handle as string,
              status: p.status as string,
              thumbnail: (p.thumbnail as string | null) ?? null,
              metadata: (p.metadata as Record<string, unknown> | null) ?? null,
              sales_channel_ids: ((p.sales_channels as ({ id: string } | null)[]) ?? [])
                .filter((s): s is { id: string } => Boolean(s))
                .map((s) => s.id),
            }
          : null,
      });
    }
  }
  return out;
}

/**
 * Unidades vendibles de cada variante: `Infinity` si no hay límite; granel, pedidos mínimos
 * (pasos disponibles / pasos del mínimo). Producto no publicado → 0 (no se avisa).
 */
export async function availableUnits(
  container: MedusaContainer,
  infos: Map<string, VariantInfo>,
): Promise<Map<string, number>> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const out = new Map<string, number>();
  const byChannel = new Map<string, string[]>();
  for (const v of infos.values()) {
    if (!v.product || v.product.status !== "published") {
      out.set(v.id, 0);
      continue;
    }
    if (!v.manage_inventory || v.allow_backorder) {
      out.set(v.id, Infinity);
      continue;
    }
    out.set(v.id, 0);
    for (const sc of v.product.sales_channel_ids) {
      byChannel.set(sc, [...(byChannel.get(sc) ?? []), v.id]);
    }
  }
  for (const [sales_channel_id, ids] of byChannel) {
    // `as never`: Query del contenedor y el tipo que espera la utilidad salen de dos copias de
    // @medusajs/types (pnpm, distinto peer de vite); es el mismo objeto en tiempo de ejecución.
    const result = await getVariantAvailability(query as never, {
      variant_ids: ids,
      sales_channel_id,
    });
    for (const [id, a] of Object.entries(result)) {
      out.set(id, Math.max(out.get(id) ?? 0, a.availability ?? 0));
    }
  }
  for (const v of infos.values()) {
    const rule = bulkRule(v.metadata);
    const units = out.get(v.id) ?? 0;
    if (rule && Number.isFinite(units)) {
      out.set(v.id, Math.floor(units / Math.ceil(rule.minG / rule.stepG)));
    }
  }
  return out;
}

/** Avisos activos (esperando) de esas variantes, o de todas sin `variantIds`. */
export async function waitingAlerts(
  container: MedusaContainer,
  variantIds?: string[],
): Promise<(AlertRow & { created_at: Date })[]> {
  const rows = await service(container).listStockAlerts(
    { notified_at: null, ...(variantIds ? { variant_id: variantIds } : {}) },
    { select: ["id", "customer_id", "product_id", "variant_id", "created_at"] },
  );
  return rows as unknown as (AlertRow & { created_at: Date })[];
}

/** Nombres para el resumen (Admin y script). */
export function namesOf(infos: Map<string, VariantInfo>) {
  return new Map(
    [...infos.values()].map((v) => [
      v.id,
      {
        product_title: v.product?.title ?? v.id,
        variant_title: variantLabel(v.product?.title ?? "", v.title),
        sku: v.sku,
      },
    ]),
  );
}
