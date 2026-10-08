import type { MedusaContainer } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  Modules,
  PriceListStatus,
  PriceListType,
  ProductStatus,
  QueryContext,
} from "@medusajs/framework/utils";

/**
 * Productos en oferta (fase I-Interficie, D5 = A). La Store API no filtra productos por Price
 * List, así que se calcula aquí, solo lectura:
 *   1. Price Lists `sale` activas y dentro de su ventana de fechas;
 *   2. sus precios → price sets → variantes → productos candidatos (enlace
 *      `product_variant_price_set`, Query);
 *   3. se CONFIRMA con el precio calculado de la región (Query + QueryContext): solo cuenta si
 *      `calculated_price.price_list_type === "sale"` y es menor que el original. Así se respetan
 *      las reglas de la lista (región, grupo de cliente…) sin reimplementarlas.
 * Fuentes: context7 /medusajs/medusa ("sale price", price calculation, QueryContext) y tipos
 * de @medusajs/types 2.21.2 (`BaseCalculatedPriceSet`).
 */

export interface SaleListWindow {
  type?: string | null | undefined;
  status?: string | null | undefined;
  starts_at?: string | Date | null | undefined;
  ends_at?: string | Date | null | undefined;
}

/** Lista `sale`, activa y vigente en `now`. */
export function isLiveSaleList(list: SaleListWindow, now: Date): boolean {
  if (list.type !== PriceListType.SALE || list.status !== PriceListStatus.ACTIVE) return false;
  const t = now.getTime();
  if (list.starts_at && new Date(list.starts_at).getTime() > t) return false;
  if (list.ends_at && new Date(list.ends_at).getTime() <= t) return false;
  return true;
}

export interface PricedVariantLike {
  calculated_price?: {
    calculated_amount?: number | null;
    original_amount?: number | null;
    calculated_price?: { price_list_type?: string | null } | null;
  } | null;
}

/** La variante tiene precio rebajado por una lista `sale` (menor que el original). */
export function isVariantOnSale(variant: PricedVariantLike | null | undefined): boolean {
  const p = variant?.calculated_price;
  if (!p || p.calculated_price?.price_list_type !== PriceListType.SALE) return false;
  const calc = p.calculated_amount;
  const orig = p.original_amount;
  return typeof calc === "number" && typeof orig === "number" && calc < orig;
}

type ProductRow = {
  id: string;
  title?: string | null;
  status?: string | null;
  sales_channels?: ({ id: string } | null)[] | null;
  variants?: (PricedVariantLike | null)[] | null;
};

/** Ids de productos publicados del canal con alguna variante en oferta, por título. */
export function pickSaleProducts(rows: ProductRow[], salesChannelIds: string[]): string[] {
  const channels = new Set(salesChannelIds);
  return rows
    .filter((p) => p.status === ProductStatus.PUBLISHED)
    .filter((p) => (p.sales_channels ?? []).some((s) => s && channels.has(s.id)))
    .filter((p) => (p.variants ?? []).some(isVariantOnSale))
    .sort((a, b) => (a.title ?? "").localeCompare(b.title ?? "", "es"))
    .map((p) => p.id);
}

const BATCH = 200;

export async function listSaleProductIds(
  container: MedusaContainer,
  opts: { regionId: string; currencyCode: string; salesChannelIds: string[]; now?: Date },
): Promise<string[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const pricing = container.resolve(Modules.PRICING);
  const now = opts.now ?? new Date();

  const lists = (
    await pricing.listPriceLists(
      { status: [PriceListStatus.ACTIVE] },
      { select: ["id", "type", "status", "starts_at", "ends_at"] },
    )
  ).filter((l) => isLiveSaleList(l, now));
  if (!lists.length || !opts.salesChannelIds.length) return [];

  const prices = await pricing.listPrices(
    { price_list_id: lists.map((l) => l.id), currency_code: opts.currencyCode },
    { select: ["price_set_id"] },
  );
  const priceSetIds = [...new Set(prices.map((p) => p.price_set_id).filter(Boolean))] as string[];
  if (!priceSetIds.length) return [];

  const productIds = new Set<string>();
  for (let i = 0; i < priceSetIds.length; i += BATCH) {
    const { data } = await query.graph({
      entity: "product_variant_price_set",
      fields: ["variant.product_id"],
      filters: { price_set_id: priceSetIds.slice(i, i + BATCH) },
    });
    for (const row of data as { variant?: { product_id?: string | null } | null }[]) {
      if (row.variant?.product_id) productIds.add(row.variant.product_id);
    }
  }

  const ids = [...productIds];
  const rows: ProductRow[] = [];
  for (let i = 0; i < ids.length; i += BATCH) {
    const { data } = await query.graph({
      entity: "product",
      fields: [
        "id",
        "title",
        "status",
        "sales_channels.id",
        "variants.calculated_price.calculated_amount",
        "variants.calculated_price.original_amount",
        "variants.calculated_price.calculated_price.price_list_type",
      ],
      filters: { id: ids.slice(i, i + BATCH) },
      context: {
        variants: {
          calculated_price: QueryContext({
            region_id: opts.regionId,
            currency_code: opts.currencyCode,
          }),
        },
      },
    });
    rows.push(...(data as ProductRow[]));
  }
  return pickSaleProducts(rows, opts.salesChannelIds);
}
