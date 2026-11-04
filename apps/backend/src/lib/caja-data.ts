import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, QueryContext } from "@medusajs/framework/utils";
import { bulkRule } from "./granel";
import { toNumber, type Numeric } from "./numeric";
import { CAJA_META, cajaSummary, isCajaLine, lineDetails } from "./line-data";
import { productDesign } from "./disenos";
import { cajaTimeConfig, deadline } from "./caja-time";
import {
  CAJA_ACEPTADA,
  CAJA_DE,
  CAJA_EDITABLE,
  CAJA_SNACK_CATEGORIES,
  type CajaEstado,
  type CandidateVariant,
} from "./caja";
import { CAJA_MODULE } from "../modules/caja";
import type CajaModuleService from "../modules/caja/service";

/**
 * Lecturas de la caja de snacks (Fase CS-3): pedido con sus cajas, snacks que se pueden meter
 * (con PVP y stock libre) y variantes candidatas para validar un contenido.
 */

type Row = Record<string, unknown>;
const query = (c: MedusaContainer) => c.resolve(ContainerRegistrationKeys.QUERY);
/** Título de variante que se enseña (sin «Única», la de los productos sin opciones). */
const variantLabel = (t: string | null | undefined) =>
  t && t !== "Única" && t !== "Default" && t !== "Default variant" ? t : null;
const cajas = (c: MedusaContainer) => c.resolve<CajaModuleService>(CAJA_MODULE);

/** Ids de las categorías de snacks y de todas sus descendientes. */
export async function snackCategoryIds(container: MedusaContainer): Promise<Set<string>> {
  const { data } = await query(container).graph({
    entity: "product_category",
    fields: ["id", "handle", "parent_category_id"],
  });
  const rows = data as { id: string; handle: string; parent_category_id: string | null }[];
  const children = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.parent_category_id) continue;
    children.set(r.parent_category_id, [...(children.get(r.parent_category_id) ?? []), r.id]);
  }
  const out = new Set<string>();
  const stack = rows
    .filter((r) => (CAJA_SNACK_CATEGORIES as readonly string[]).includes(r.handle))
    .map((r) => r.id);
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    stack.push(...(children.get(id) ?? []));
  }
  return out;
}

export interface OrderCajaContext {
  id: string;
  status: string;
  region_id: string | null;
  currency_code: string;
  sales_channel_id: string | null;
  /** Lo pendiente de cobrar (> 0 = pago sin capturar). */
  pending: number;
  items: {
    id: string;
    variant_id: string | null;
    title: string;
    variant_title: string | null;
    quantity: number;
    unit_price: number;
    metadata: Record<string, unknown> | null;
    /** Granel: gramos de cada paso (metadata de la variante). */
    step_g: number | null;
  }[];
  /** ¿Hay una edición (u otro cambio) del pedido sin terminar? */
  pendingChange: boolean;
}

export async function orderCajaContext(
  container: MedusaContainer,
  orderId: string,
): Promise<OrderCajaContext | null> {
  const { data } = await query(container).graph({
    entity: "order",
    fields: [
      "id",
      "status",
      "region_id",
      "currency_code",
      "sales_channel_id",
      "summary.pending_difference",
      "items.id",
      "items.variant_id",
      "items.title",
      "items.product_title",
      "items.variant_title",
      "items.quantity",
      "items.unit_price",
      "items.metadata",
      "items.variant.metadata",
    ],
    filters: { id: orderId },
  });
  const o = data[0] as Row | undefined;
  if (!o) return null;
  const { data: changes } = await query(container).graph({
    entity: "order_change",
    fields: ["id"],
    filters: { order_id: orderId, status: ["pending", "requested"] },
  });
  const summary = (o.summary ?? {}) as { pending_difference?: Numeric };
  return {
    id: o.id as string,
    status: o.status as string,
    region_id: (o.region_id as string | null) ?? null,
    currency_code: (o.currency_code as string) ?? "eur",
    sales_channel_id: (o.sales_channel_id as string | null) ?? null,
    pending: toNumber(summary.pending_difference),
    items: ((o.items as Row[] | null) ?? []).filter(Boolean).map((i) => ({
      id: i.id as string,
      variant_id: (i.variant_id as string | null) ?? null,
      title: ((i.product_title ?? i.title) as string) ?? "",
      variant_title: variantLabel(i.variant_title as string | null),
      quantity: toNumber(i.quantity as Numeric),
      unit_price: toNumber(i.unit_price as Numeric),
      metadata: (i.metadata as Record<string, unknown> | null) ?? null,
      step_g:
        bulkRule(((i.variant as Row | null)?.metadata as Record<string, unknown> | null) ?? null)
          ?.stepG ?? null,
    })),
    pendingChange: changes.length > 0,
  };
}

interface VariantRow {
  id: string;
  sku?: string | null;
  title?: string | null;
  metadata?: Record<string, unknown> | null;
  manage_inventory?: boolean | null;
  product?: {
    title?: string | null;
    status?: string | null;
    metadata?: Record<string, unknown> | null;
    categories?: ({ id: string } | null)[] | null;
  } | null;
  calculated_price?: { calculated_amount?: Numeric } | null;
  inventory_items?:
    | ({
        required_quantity?: Numeric;
        inventory?: {
          location_levels?:
            | ({
                location_id?: string;
                stocked_quantity?: Numeric;
                reserved_quantity?: Numeric;
              } | null)[]
            | null;
        } | null;
      } | null)[]
    | null;
}

const VARIANT_FIELDS = [
  "id",
  "sku",
  "title",
  "metadata",
  "manage_inventory",
  "product.title",
  "product.status",
  "product.metadata",
  "product.categories.id",
  "calculated_price.calculated_amount",
];

const priceContext = (regionId: string | null, currency: string) => ({
  calculated_price: QueryContext({
    ...(regionId ? { region_id: regionId } : {}),
    currency_code: currency,
  }),
});

const candidate = (v: VariantRow, snacks: Set<string>): CandidateVariant => ({
  id: v.id,
  price:
    v.calculated_price?.calculated_amount != null
      ? toNumber(v.calculated_price.calculated_amount)
      : null,
  published: v.product?.status === "published",
  // Productos con datos propios (la caja, la correa) no van dentro de una caja
  snack:
    (v.product?.categories ?? []).some((c) => !!c && snacks.has(c.id)) &&
    productDesign({ metadata: v.product?.metadata ?? null }).datos_linea === null,
  stepG: bulkRule(v.metadata ?? null)?.stepG ?? null,
});

/** Variantes candidatas a meter en una caja (validación del contenido). */
export async function candidateVariants(
  container: MedusaContainer,
  ids: string[],
  regionId: string | null,
  currency: string,
): Promise<Map<string, CandidateVariant>> {
  if (!ids.length) return new Map();
  const snacks = await snackCategoryIds(container);
  const { data } = await query(container).graph({
    entity: "product_variant",
    fields: VARIANT_FIELDS,
    filters: { id: ids },
    context: priceContext(regionId, currency),
  });
  return new Map((data as VariantRow[]).map((v) => [v.id, candidate(v, snacks)]));
}

export interface SnackOption {
  variant_id: string;
  title: string;
  variant_title: string | null;
  sku: string | null;
  /** PVP de una unidad, o de un paso en el granel. */
  price: number;
  /** Granel: gramos de cada paso (en el widget la cantidad va en gramos); null = por unidades. */
  step_g: number | null;
  /** Granel: €/kg. */
  price_kg: number | null;
  /**
   * Libre en la web (stock − reservado; null = sin control de stock). Puede ser ≤ 0. Granel: en
   * gramos.
   */
  available: number | null;
}

/** Snacks que se pueden meter en una caja (publicados, con precio, sin granel), por título. */
export async function snackOptions(
  container: MedusaContainer,
  regionId: string | null,
  currency: string,
  salesChannelId: string | null,
): Promise<SnackOption[]> {
  const snacks = await snackCategoryIds(container);
  if (!snacks.size) return [];
  const { data: products } = await query(container).graph({
    entity: "product",
    fields: ["id", "categories.id"],
    filters: { status: "published", categories: { id: [...snacks] } } as never,
  });
  const productIds = (products as { id: string }[]).map((p) => p.id);
  if (!productIds.length) return [];
  let locations: Set<string> | null = null;
  if (salesChannelId) {
    const { data } = await query(container).graph({
      entity: "sales_channel_locations",
      fields: ["stock_location_id"],
      filters: { sales_channel_id: salesChannelId },
    });
    locations = new Set((data as Row[]).map((r) => r.stock_location_id as string));
  }
  const { data } = await query(container).graph({
    entity: "product_variant",
    fields: [
      ...VARIANT_FIELDS,
      "inventory_items.required_quantity",
      "inventory_items.inventory.location_levels.location_id",
      "inventory_items.inventory.location_levels.stocked_quantity",
      "inventory_items.inventory.location_levels.reserved_quantity",
    ],
    filters: { product_id: productIds },
    context: priceContext(regionId, currency),
  });
  const out: SnackOption[] = [];
  for (const v of data as VariantRow[]) {
    const c = candidate(v, snacks);
    if (!c.published || !c.snack || c.price === null) continue;
    let available: number | null = null;
    if (v.manage_inventory !== false) {
      const units = (v.inventory_items ?? []).filter(Boolean).map((link) => {
        const free = (link!.inventory?.location_levels ?? [])
          .filter((l) => !!l && (!locations || locations.has(l.location_id ?? "")))
          .reduce(
            (sum, l) => sum + toNumber(l!.stocked_quantity) - toNumber(l!.reserved_quantity),
            0,
          );
        // Granel: el artículo va en gramos (kit de `paso_g` por unidad): se enseñan los gramos
        if (c.stepG) return Math.floor(free + 1e-9);
        return Math.floor((free + 1e-9) / (toNumber(link!.required_quantity) || 1));
      });
      available = units.length ? Math.min(...units) : 0;
    }
    out.push({
      variant_id: v.id,
      title: v.product?.title ?? "",
      variant_title: variantLabel(v.title),
      sku: v.sku ?? null,
      price: c.price,
      step_g: c.stepG,
      price_kg: c.stepG ? Math.round(((c.price * 1000) / c.stepG) * 100) / 100 : null,
      available,
    });
  }
  return out.sort(
    (a, b) =>
      a.title.localeCompare(b.title, "es") ||
      (a.variant_title ?? "").localeCompare(b.variant_title ?? "", "es"),
  );
}

export interface CajaView {
  /** Id de la línea de la caja (clave de la caja en el pedido). */
  line_item_id: string;
  caja_id: string | null;
  estado: CajaEstado;
  editable: boolean;
  intento: number;
  rellenada_at: string | null;
  propuesta_at: string | null;
  /** Fin del plazo para responder (aceptación automática), si está propuesta. */
  vence_at: string | null;
  respondida_at: string | null;
  motivo_rechazo: string | null;
  /** Precio pagado por la caja (IVA incluido). */
  paid: number;
  title: string;
  /** «Para Toby» (resumen del <details>) y lo de dentro (lib/line-data.ts `cajaSummary`). */
  name: string;
  details: string[];
  /** `quantity`: unidades, o gramos en el granel (como se edita en el widget). */
  content: {
    item_id: string;
    variant_id: string | null;
    title: string;
    quantity: number;
    step_g: number | null;
  }[];
}

/** Cajas de un pedido para el widget: una por línea de caja, con su contenido actual. */
export async function orderCajas(
  container: MedusaContainer,
  ctx: OrderCajaContext,
): Promise<CajaView[]> {
  // Orden estable (widget, email): por el nombre de la mascota (las líneas del pedido se crean
  // todas a la vez: `created_at` empata) y el id
  const name = (m: Record<string, unknown> | null) => String(m?.[CAJA_META.name] ?? "");
  const lines = ctx.items
    .filter((i) => isCajaLine(i.metadata) && i.quantity > 0)
    .sort(
      (a, b) => name(a.metadata).localeCompare(name(b.metadata), "es") || a.id.localeCompare(b.id),
    );
  if (!lines.length) return [];
  const rows = await cajas(container).listCajas({ order_id: ctx.id });
  const byLine = new Map(rows.map((r) => [r.line_item_id, r]));
  const cfg = cajaTimeConfig();
  const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);
  return lines.map((l) => {
    const row = byLine.get(l.id);
    const estado = (row?.estado ?? "pendiente") as CajaEstado;
    return {
      line_item_id: l.id,
      caja_id: row?.id ?? null,
      estado,
      editable: CAJA_EDITABLE.includes(estado),
      intento: row?.intento ?? 0,
      rellenada_at: iso(row?.rellenada_at),
      propuesta_at: iso(row?.propuesta_at),
      vence_at:
        estado === "propuesta" && row?.propuesta_at
          ? deadline(new Date(row.propuesta_at), cfg).toISOString()
          : null,
      respondida_at: iso(row?.respondida_at),
      motivo_rechazo: row?.motivo_rechazo ?? null,
      paid: l.unit_price,
      title: l.variant_title ? `${l.title} · ${l.variant_title}` : l.title,
      name: cajaSummary(l.metadata)?.name ?? "Caja de snacks",
      details: cajaSummary(l.metadata)?.details ?? lineDetails(l.metadata),
      content: ctx.items
        .filter((i) => i.metadata?.[CAJA_DE] === l.id && i.quantity > 0)
        .map((i) => ({
          item_id: i.id,
          variant_id: i.variant_id,
          title: i.variant_title ? `${i.title} · ${i.variant_title}` : i.title,
          quantity: i.step_g ? i.quantity * i.step_g : i.quantity,
          step_g: i.step_g,
        })),
    };
  });
}

/** Cajas que impiden enviar el pedido: todas tienen que estar aceptadas (o aceptadas a las 24 h). */
export async function shipBlockingCajas(
  container: MedusaContainer,
  orderId: string,
): Promise<number> {
  const ctx = await orderCajaContext(container, orderId);
  if (!ctx) return 0;
  const views = await orderCajas(container, ctx);
  return views.filter((c) => !CAJA_ACEPTADA.includes(c.estado)).length;
}
