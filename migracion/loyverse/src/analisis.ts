/**
 * Paso 2 (lógica pura, sin I/O): del catálogo y los tickets de Loyverse a las filas de la hoja de
 * revisión, el resumen por categoría y las ventas por mes y por día. Probado en analisis.test.ts.
 * El coste de Loyverse NO es fiable (hay artículos sin coste): se muestra, pero no se usa para
 * conclusiones (el informe no calcula márgenes).
 */
import type { Category, InventoryLevel, Item, Supplier, Tax, Variant } from "./types.ts";

export const TIME_ZONE = "Europe/Madrid";
const DAY_MS = 24 * 60 * 60 * 1000;

/** Umbrales de la sugerencia (meses). */
export const RULES = { recentMonths: 12, staleMonths: 24, newMonths: 6 } as const;

/** Línea de ticket tal como la guarda `descargar` (trimReceipt). */
export interface SaleLine {
  item_id: string | null;
  variant_id: string | null;
  item_name: string | null;
  variant_name: string | null;
  quantity: number;
  total_money: number | null;
  cost_total: number | null;
}
export interface SaleReceipt {
  receipt_number: string;
  receipt_type: "SALE" | "REFUND";
  created_at: string;
  receipt_date: string;
  cancelled_at: string | null;
  total_money: number | null;
  total_tax: number | null;
  total_discount: number | null;
  line_items: SaleLine[];
  payments?: { name: string | null; type: string | null; money_amount: number | null }[];
}

// ── Fechas en hora de Madrid ─────────────────────────────────────────────────────────────────

const ymd = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
/** AAAA-MM-DD en hora de Madrid. */
export const localDay = (iso: string) => ymd.format(new Date(iso));
export const localMonth = (iso: string) => localDay(iso).slice(0, 7);

const monthsAgo = (now: Date, months: number) => new Date(now.getTime() - months * 30.44 * DAY_MS);

// ── Ventas por variante ──────────────────────────────────────────────────────────────────────

export interface VariantSales {
  lastSale: string | null; // ISO
  units12: number;
  units24: number;
  unitsTotal: number;
  amount12: number;
  amountTotal: number;
}

const emptySales = (): VariantSales => ({
  lastSale: null,
  units12: 0,
  units24: 0,
  unitsTotal: 0,
  amount12: 0,
  amountTotal: 0,
});

/** Signo de un ticket: venta +1, devolución −1, cancelado 0. */
export const receiptSign = (r: Pick<SaleReceipt, "receipt_type" | "cancelled_at">) =>
  r.cancelled_at ? 0 : r.receipt_type === "REFUND" ? -1 : 1;

export interface SalesIndex {
  byVariant: Map<string, VariantSales>;
  /** Líneas sin variante conocida en el catálogo (artículos borrados del todo, etc.). */
  orphanLines: number;
  receipts: number;
  first: string | null;
  last: string | null;
}

/**
 * Acumula las ventas por variante. La «última venta» solo cuenta ventas (no devoluciones).
 * `knownVariants`: ids del catálogo (para contar las líneas huérfanas).
 */
export function indexSales(
  receipts: Iterable<SaleReceipt>,
  knownVariants: Set<string>,
  now: Date,
): SalesIndex {
  const byVariant = new Map<string, VariantSales>();
  const cut12 = monthsAgo(now, RULES.recentMonths).getTime();
  const cut24 = monthsAgo(now, RULES.staleMonths).getTime();
  let orphanLines = 0;
  let count = 0;
  let first: string | null = null;
  let last: string | null = null;
  for (const r of receipts) {
    const sign = receiptSign(r);
    if (!sign) continue;
    count++;
    const date = r.receipt_date || r.created_at;
    if (!first || date < first) first = date;
    if (!last || date > last) last = date;
    const t = new Date(date).getTime();
    for (const l of r.line_items) {
      if (!l.variant_id || !knownVariants.has(l.variant_id)) {
        orphanLines++;
        continue;
      }
      let s = byVariant.get(l.variant_id);
      if (!s) byVariant.set(l.variant_id, (s = emptySales()));
      const qty = sign * (Number(l.quantity) || 0);
      const money = sign * (Number(l.total_money) || 0);
      s.unitsTotal += qty;
      s.amountTotal += money;
      if (t >= cut24) s.units24 += qty;
      if (t >= cut12) {
        s.units12 += qty;
        s.amount12 += money;
      }
      if (sign > 0 && (!s.lastSale || date > s.lastSale)) s.lastSale = date;
    }
  }
  return { byVariant, orphanLines, receipts: count, first, last };
}

// ── Sugerencia ───────────────────────────────────────────────────────────────────────────────

export type Suggestion = "sí" | "no" | "revisar";

export function suggest(
  input: {
    deleted: boolean;
    createdAt: string | null | undefined;
    stock: number | null;
    sales: VariantSales | undefined;
  },
  now: Date,
): { suggestion: Suggestion; reason: string } {
  const { deleted, createdAt, stock, sales } = input;
  if (deleted) return { suggestion: "no", reason: "borrado en Loyverse" };
  const last = sales?.lastSale ? new Date(sales.lastSale).getTime() : null;
  const created = createdAt ? new Date(createdAt).getTime() : null;
  const isNew = created !== null && created >= monthsAgo(now, RULES.newMonths).getTime();
  const hasStock = stock !== null && stock > 0;
  if (last !== null && last >= monthsAgo(now, RULES.recentMonths).getTime()) {
    return { suggestion: "sí", reason: `vendido en los últimos ${RULES.recentMonths} meses` };
  }
  if (isNew)
    return { suggestion: "revisar", reason: `alta hace menos de ${RULES.newMonths} meses` };
  if (last === null) {
    return hasStock
      ? { suggestion: "revisar", reason: "nunca vendido, pero hay stock" }
      : { suggestion: "no", reason: "nunca vendido y sin stock" };
  }
  if (last < monthsAgo(now, RULES.staleMonths).getTime()) {
    return hasStock
      ? { suggestion: "revisar", reason: `sin ventas en ${RULES.staleMonths} meses, con stock` }
      : { suggestion: "no", reason: `sin ventas en ${RULES.staleMonths} meses y sin stock` };
  }
  return {
    suggestion: "revisar",
    reason: `última venta hace ${RULES.recentMonths}–${RULES.staleMonths} meses`,
  };
}

// ── Grupos de nombres parecidos (posibles variantes de un mismo producto) ────────────────────

const SIZE =
  /^(xxs|xs|s|m|l|xl|xxl|xxxl|xxxxl|t\d{1,2}|talla|mini|pequeno|mediano|grande|maxi|junior|adulto|cachorro|puppy|small|medium|large)$/;
const COLOR =
  /^(rojo|roja|azul|verde|negro|negra|blanco|blanca|gris|rosa|amarillo|amarilla|naranja|morado|morada|lila|marron|beige|crema|turquesa|fucsia|dorado|dorada|plateado|plateada|burdeos|granate|camel|caqui|kaki|celeste|marino|multicolor|transparente)$/;
const MEASURE =
  /^\d+([.,]\d+)?(x\d+([.,]\d+)?)?(kg|g|gr|grs|mg|l|ml|cl|cm|mm|m|uds?|u|pcs|lb|oz)?$/;
const UNIT = /^(kg|g|gr|grs|mg|l|ml|cl|cm|mm|m|uds?|u|pcs|lb|oz|x)$/;
const STOP = new Set(["de", "del", "la", "el", "los", "las", "y", "con", "para", "en", "-", "/"]);

/** Clave de grupo: el nombre sin tallas, colores, medidas ni números. */
export function groupKey(name: string): string {
  const words = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // La coma y el punto decimales se quedan dentro del número («11,4kg»); el resto separa.
    .replace(/(\d)[.,](\d)/g, "$1·$2")
    .replace(/[()[\]"'.,;:+*]/g, " ")
    .replace(/·/g, ".")
    .split(/[\s/_-]+/)
    .filter(Boolean)
    .filter(
      (w) => !SIZE.test(w) && !COLOR.test(w) && !MEASURE.test(w) && !UNIT.test(w) && !STOP.has(w),
    );
  return words.join(" ");
}

/** Artículos (vivos) cuyo nombre sin talla/color/medida coincide: posibles variantes. */
export function similarGroups(items: Pick<Item, "id" | "item_name">[]): Map<string, string> {
  const byKey = new Map<string, string[]>();
  for (const it of items) {
    const key = groupKey(it.item_name);
    if (key.length < 3) continue;
    const list = byKey.get(key) ?? [];
    list.push(it.id);
    byKey.set(key, list);
  }
  const out = new Map<string, string>();
  for (const [key, ids] of byKey) {
    if (ids.length < 2) continue;
    for (const id of ids) out.set(id, key);
  }
  return out;
}

// ── Hoja de revisión ─────────────────────────────────────────────────────────────────────────

/** Columnas que rellena el usuario: se conservan al volver a generar la hoja. */
export const EDITABLE = ["decision", "categoria_nueva", "nombre_nuevo", "notas"] as const;

export const REVIEW_COLUMNS = [
  "decision",
  "sugerencia",
  "motivo",
  "categoria",
  "articulo",
  "variante",
  "opciones",
  "sku",
  "codigo_barras",
  "precio",
  "coste",
  "margen_pct",
  "stock",
  "ultima_venta",
  "uds_12m",
  "uds_24m",
  "uds_total",
  "importe_12m",
  "importe_total",
  "proveedor",
  "iva",
  "por_peso",
  "alta",
  "modificado",
  "borrado",
  "problemas",
  "grupo_sugerido",
  "categoria_nueva",
  "nombre_nuevo",
  "notas",
  "item_id",
  "variant_id",
] as const;

export type ReviewRow = Record<(typeof REVIEW_COLUMNS)[number], string | number | null>;

export interface Catalog {
  items: Item[];
  categories: Category[];
  suppliers: Supplier[];
  taxes: Tax[];
  inventory: InventoryLevel[];
  storeId: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const dayOrNull = (iso: string | null | undefined) => (iso ? localDay(iso) : null);

/** Precio de la variante en la tienda (override de la tienda o el de por defecto). */
export function variantPrice(v: Variant, storeId: string): number | null {
  const store = v.stores?.find((s) => s.store_id === storeId);
  const type = store?.pricing_type ?? v.default_pricing_type;
  if (type === "VARIABLE") return null;
  const price = store?.price ?? v.default_price;
  return typeof price === "number" ? price : null;
}

export function buildReview(catalog: Catalog, sales: SalesIndex, now: Date): ReviewRow[] {
  const categories = new Map(catalog.categories.map((c) => [c.id, c]));
  const suppliers = new Map(catalog.suppliers.map((s) => [s.id, s.name]));
  const taxes = new Map(catalog.taxes.map((t) => [t.id, t]));
  const stock = new Map(
    catalog.inventory
      .filter((l) => l.store_id === catalog.storeId)
      .map((l) => [l.variant_id, l.in_stock]),
  );
  const live = catalog.items.filter((i) => !i.deleted_at);
  const groups = similarGroups(live);

  // Duplicados de SKU y código de barras (solo variantes vivas).
  const count = (values: (string | null | undefined)[]) => {
    const m = new Map<string, number>();
    for (const v of values) if (v) m.set(v, (m.get(v) ?? 0) + 1);
    return m;
  };
  const liveVariants = live.flatMap((i) => i.variants.filter((v) => !v.deleted_at));
  const skus = count(liveVariants.map((v) => v.sku?.trim()));
  const barcodes = count(liveVariants.map((v) => v.barcode?.trim()));

  const rows: ReviewRow[] = [];
  for (const item of catalog.items) {
    const category = item.category_id ? categories.get(item.category_id) : undefined;
    const optionNames = [item.option1_name, item.option2_name, item.option3_name].filter(Boolean);
    for (const v of item.variants) {
      const deleted = Boolean(item.deleted_at || v.deleted_at);
      const s = sales.byVariant.get(v.variant_id);
      const qty = stock.has(v.variant_id) ? (stock.get(v.variant_id) as number) : null;
      const price = variantPrice(v, catalog.storeId);
      const cost = typeof v.cost === "number" ? v.cost : null;
      const problems: string[] = [];
      if (!deleted) {
        if (!category) problems.push("sin categoría");
        if (price === null) problems.push("precio variable");
        else if (price <= 0) problems.push("precio 0");
        if (v.sku && (skus.get(v.sku.trim()) ?? 0) > 1) problems.push("SKU repetido");
        if (v.barcode && (barcodes.get(v.barcode.trim()) ?? 0) > 1) {
          problems.push("código de barras repetido");
        }
        // Stock negativo: no es un problema (se vende sin dar entrada a la mercancía; decisión del
        // usuario). Para la sugerencia cuenta como «sin stock».
      }
      const { suggestion, reason } = suggest(
        { deleted, createdAt: item.created_at, stock: qty, sales: s },
        now,
      );
      const taxList = (item.tax_ids ?? [])
        .map((id) => taxes.get(id))
        .filter((t): t is Tax => !!t)
        .map((t) => String(t.rate));
      rows.push({
        decision: "",
        sugerencia: suggestion,
        motivo: reason,
        categoria: category?.name ?? "",
        articulo: item.item_name,
        variante: [v.option1_value, v.option2_value, v.option3_value].filter(Boolean).join(" / "),
        opciones: optionNames.join(" / "),
        sku: v.sku ?? "",
        codigo_barras: v.barcode ?? "",
        precio: price,
        coste: cost,
        // Sin coste (0 o vacío) no hay margen: el coste de Loyverse no siempre está rellenado.
        margen_pct:
          price && price > 0 && cost !== null && cost > 0
            ? round2(((price - cost) / price) * 100)
            : null,
        stock: item.track_stock ? qty : null,
        ultima_venta: dayOrNull(s?.lastSale),
        uds_12m: s ? round2(s.units12) : 0,
        uds_24m: s ? round2(s.units24) : 0,
        uds_total: s ? round2(s.unitsTotal) : 0,
        importe_12m: s ? round2(s.amount12) : 0,
        importe_total: s ? round2(s.amountTotal) : 0,
        proveedor: item.primary_supplier_id ? (suppliers.get(item.primary_supplier_id) ?? "") : "",
        iva: taxList.join("+"),
        por_peso: item.sold_by_weight ? "sí" : "",
        alta: dayOrNull(item.created_at),
        modificado: dayOrNull(v.updated_at ?? item.updated_at),
        borrado: deleted ? "sí" : "",
        problemas: problems.join("; "),
        grupo_sugerido: groups.get(item.id) ?? "",
        categoria_nueva: "",
        nombre_nuevo: "",
        notas: "",
        item_id: item.id,
        variant_id: v.variant_id,
      });
    }
  }
  const collator = new Intl.Collator("es", { sensitivity: "base", numeric: true });
  rows.sort(
    (a, b) =>
      Number(a.borrado === "sí") - Number(b.borrado === "sí") ||
      collator.compare(String(a.categoria || "~"), String(b.categoria || "~")) ||
      collator.compare(String(a.articulo), String(b.articulo)) ||
      collator.compare(String(a.variante), String(b.variante)),
  );
  return rows;
}

/** Conserva lo que el usuario ya escribió (por `variant_id`) al volver a generar la hoja. */
export function mergeEdits(rows: ReviewRow[], previous: Record<string, string>[]): number {
  const byId = new Map(previous.filter((p) => p.variant_id).map((p) => [p.variant_id, p]));
  let kept = 0;
  for (const row of rows) {
    const old = byId.get(String(row.variant_id));
    if (!old) continue;
    let touched = false;
    for (const col of EDITABLE) {
      const v = old[col]?.trim();
      if (v) {
        row[col] = v;
        touched = true;
      }
    }
    if (touched) kept++;
  }
  return kept;
}

// ── Resúmenes ────────────────────────────────────────────────────────────────────────────────

export const CATEGORY_COLUMNS = [
  "categoria",
  "articulos",
  "variantes",
  "sugeridos_si",
  "sugeridos_revisar",
  "sugeridos_no",
  "con_venta_12m",
  "importe_12m",
  "con_problemas",
] as const;

export function categorySummary(rows: ReviewRow[]) {
  const byCat = new Map<
    string,
    {
      items: Set<string>;
      variants: number;
      si: number;
      revisar: number;
      no: number;
      sold: number;
      amount: number;
      problems: number;
    }
  >();
  for (const r of rows) {
    if (r.borrado === "sí") continue;
    const key = String(r.categoria || "(sin categoría)");
    let c = byCat.get(key);
    if (!c) {
      c = {
        items: new Set(),
        variants: 0,
        si: 0,
        revisar: 0,
        no: 0,
        sold: 0,
        amount: 0,
        problems: 0,
      };
      byCat.set(key, c);
    }
    c.items.add(String(r.item_id));
    c.variants++;
    if (r.sugerencia === "sí") c.si++;
    else if (r.sugerencia === "no") c.no++;
    else c.revisar++;
    if (Number(r.uds_12m) > 0) c.sold++;
    c.amount += Number(r.importe_12m) || 0;
    if (r.problemas) c.problems++;
  }
  return [...byCat.entries()]
    .sort((a, b) => b[1].amount - a[1].amount)
    .map(([categoria, c]) => ({
      categoria,
      articulos: c.items.size,
      variantes: c.variants,
      sugeridos_si: c.si,
      sugeridos_revisar: c.revisar,
      sugeridos_no: c.no,
      con_venta_12m: c.sold,
      importe_12m: round2(c.amount),
      con_problemas: c.problems,
    }));
}

export const DAILY_COLUMNS = [
  "fecha",
  "tickets",
  "devoluciones",
  "importe",
  "impuestos",
  "descuentos",
  "ticket_medio",
] as const;

/** Ventas por día (hora de Madrid): lo que Loyverse no deja pedir de una vez. */
export function dailySales(receipts: Iterable<SaleReceipt>) {
  const byDay = new Map<
    string,
    { sales: number; refunds: number; money: number; tax: number; discount: number }
  >();
  for (const r of receipts) {
    const sign = receiptSign(r);
    if (!sign) continue;
    const day = localDay(r.receipt_date || r.created_at);
    let d = byDay.get(day);
    if (!d) byDay.set(day, (d = { sales: 0, refunds: 0, money: 0, tax: 0, discount: 0 }));
    if (sign > 0) d.sales++;
    else d.refunds++;
    d.money += sign * (Number(r.total_money) || 0);
    d.tax += sign * (Number(r.total_tax) || 0);
    d.discount += sign * (Number(r.total_discount) || 0);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, d]) => ({
      fecha,
      tickets: d.sales,
      devoluciones: d.refunds,
      importe: round2(d.money),
      impuestos: round2(d.tax),
      descuentos: round2(d.discount),
      ticket_medio: d.sales ? round2(d.money / d.sales) : 0,
    }));
}

export const MONTHLY_COLUMNS = [
  "mes",
  "categoria",
  "articulo",
  "variante",
  "unidades",
  "importe",
  "coste",
  "item_id",
  "variant_id",
] as const;

/** Ventas por mes y variante (formato largo, para tablas dinámicas y tendencias). */
export function monthlySales(
  receipts: Iterable<SaleReceipt>,
  names: Map<string, { categoria: string; articulo: string; variante: string; item_id: string }>,
) {
  const acc = new Map<string, { units: number; money: number; cost: number }>();
  for (const r of receipts) {
    const sign = receiptSign(r);
    if (!sign) continue;
    const month = localMonth(r.receipt_date || r.created_at);
    for (const l of r.line_items) {
      const key = `${month}|${l.variant_id ?? `?${l.item_name ?? ""}`}`;
      let a = acc.get(key);
      if (!a) acc.set(key, (a = { units: 0, money: 0, cost: 0 }));
      a.units += sign * (Number(l.quantity) || 0);
      a.money += sign * (Number(l.total_money) || 0);
      a.cost += sign * (Number(l.cost_total) || 0);
    }
  }
  return [...acc.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, a]) => {
      const [mes, id = ""] = key.split("|");
      const n = names.get(id);
      return {
        mes: mes ?? "",
        categoria: n?.categoria ?? "",
        articulo: n?.articulo ?? id.replace(/^\?/, ""),
        variante: n?.variante ?? "",
        unidades: round2(a.units),
        importe: round2(a.money),
        coste: round2(a.cost),
        item_id: n?.item_id ?? "",
        variant_id: id.startsWith("?") ? "" : id,
      };
    });
}
