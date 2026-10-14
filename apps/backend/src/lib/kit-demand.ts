import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/**
 * Demanda de inventario de TODO el carrito por artículo de inventario (Fase E-2).
 *
 * Medusa 2.21.2 comprueba el stock línea a línea: `confirmVariantInventoryWorkflow` al añadir y
 * `createReservationItems` al completar validan cada línea contra el stock libre sin sumar las
 * demás líneas del carrito (core-flows `confirm-inventory.js`; inventory
 * `ensureInventoryLevels`, que compara con el nivel previo al lote). Si dos líneas comparten una
 * pieza (dos correas del mismo color con observaciones distintas, o dos correas con el mismo
 * mosquetón), el pedido se acepta aunque no haya material y el stock queda en negativo
 * (medido en E-2a: −6 m de cuerda). Aquí se suma la demanda por pieza y se compara con el stock
 * libre en los almacenes del canal de venta. Solo mira las piezas que piden ≥ 2 líneas: las de
 * una sola línea ya las valida Medusa.
 */

export interface DemandLine {
  variant_id: string;
  quantity: number;
}

export interface KitLink {
  variant_id: string;
  inventory_item_id: string;
  required_quantity: number;
}

/** Piezas que pide más de una línea, con la demanda total (cantidad × required_quantity). */
export function sharedDemand(lines: DemandLine[], links: KitLink[]): Map<string, number> {
  const byVariant = new Map<string, KitLink[]>();
  for (const l of links) byVariant.set(l.variant_id, [...(byVariant.get(l.variant_id) ?? []), l]);
  const demand = new Map<string, number>();
  const lineCount = new Map<string, number>();
  for (const line of lines) {
    if (!(line.quantity > 0)) continue;
    for (const link of byVariant.get(line.variant_id) ?? []) {
      const id = link.inventory_item_id;
      demand.set(id, (demand.get(id) ?? 0) + line.quantity * link.required_quantity);
      lineCount.set(id, (lineCount.get(id) ?? 0) + 1);
    }
  }
  for (const id of [...demand.keys()]) if ((lineCount.get(id) ?? 0) < 2) demand.delete(id);
  return demand;
}

/** Piezas cuya demanda supera el stock libre (margen de redondeo para la cuerda en decimales). */
export function shortages(demand: Map<string, number>, available: Map<string, number>): string[] {
  return [...demand].filter(([id, qty]) => qty - (available.get(id) ?? 0) > 1e-9).map(([id]) => id);
}

export const KIT_SHORTAGE_MESSAGE =
  "No queda material suficiente para todo lo que hay en el carrito. Baja alguna cantidad o quita una línea.";

type Row = Record<string, unknown>;

/**
 * Enlaces variante → pieza de las variantes con inventario gestionado y sin backorder (las demás
 * no gastan stock reservable).
 */
export async function loadKitLinks(
  container: MedusaContainer,
  variantIds: string[],
): Promise<KitLink[]> {
  if (!variantIds.length) return [];
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: rows } = await query.graph({
    entity: "product_variant_inventory_items",
    fields: [
      "variant_id",
      "inventory_item_id",
      "required_quantity",
      "variant.manage_inventory",
      "variant.allow_backorder",
    ],
    filters: { variant_id: variantIds },
  });
  return (rows as Row[])
    .filter((r) => {
      const v = r.variant as Row | null | undefined;
      return v?.manage_inventory !== false && v?.allow_backorder !== true;
    })
    .map((r) => ({
      variant_id: r.variant_id as string,
      inventory_item_id: r.inventory_item_id as string,
      required_quantity: Number(r.required_quantity ?? 1),
    }));
}

/**
 * Stock libre (stocked − reserved) por pieza en los almacenes del canal de venta (como
 * `getVariantAvailability` de Medusa); sin canal, en todos.
 */
export async function loadAvailable(
  container: MedusaContainer,
  inventoryItemIds: string[],
  salesChannelId: string | null | undefined,
): Promise<Map<string, number>> {
  const available = new Map<string, number>();
  if (!inventoryItemIds.length) return available;
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  let locations: Set<string> | null = null;
  if (salesChannelId) {
    const { data } = await query.graph({
      entity: "sales_channel_locations",
      fields: ["stock_location_id"],
      filters: { sales_channel_id: salesChannelId },
    });
    locations = new Set((data as Row[]).map((r) => r.stock_location_id as string));
  }
  const { data: items } = await query.graph({
    entity: "inventory_item",
    fields: [
      "id",
      "location_levels.location_id",
      "location_levels.stocked_quantity",
      "location_levels.reserved_quantity",
    ],
    filters: { id: inventoryItemIds },
  });
  for (const item of items as Row[]) {
    const levels = (item.location_levels as Row[] | null) ?? [];
    available.set(
      item.id as string,
      levels
        .filter((l) => !locations || locations.has(l.location_id as string))
        .reduce(
          (sum, l) => sum + Number(l.stocked_quantity ?? 0) - Number(l.reserved_quantity ?? 0),
          0,
        ),
    );
  }
  return available;
}

/** Unidades vendibles de cada variante: mínimo de floor(libre / required_quantity) de su kit. */
export function variantUnits(links: KitLink[], available: Map<string, number>) {
  const units = new Map<string, number>();
  for (const l of links) {
    const n = Math.floor(((available.get(l.inventory_item_id) ?? 0) + 1e-9) / l.required_quantity);
    units.set(l.variant_id, Math.min(units.get(l.variant_id) ?? Infinity, Math.max(0, n)));
  }
  return units;
}

/**
 * Comprueba la demanda conjunta de `lines` (líneas finales del carrito). Devuelve los ids de las
 * piezas que no llegan (vacío = todo bien).
 */
export async function kitShortages(
  container: MedusaContainer,
  lines: DemandLine[],
  salesChannelId: string | null | undefined,
): Promise<string[]> {
  const variantIds = [...new Set(lines.map((l) => l.variant_id))];
  if (lines.length < 2 || !variantIds.length) return [];
  const demand = sharedDemand(lines, await loadKitLinks(container, variantIds));
  if (!demand.size) return [];
  return shortages(demand, await loadAvailable(container, [...demand.keys()], salesChannelId));
}
