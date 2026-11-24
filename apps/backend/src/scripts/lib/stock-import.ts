import { isCommentCell, parseCsv } from "./csv";

/**
 * `stock:import` (fase 13): hoja de stock → cambios de inventario. Funciones PURAS (sin I/O).
 *
 * Hoja (CSV con `,` o `;`, UTF-8, filas `#` = comentario):
 *   - Identificador por fila (uno basta; si hay varios, manda el SKU y se avisa si no coinciden):
 *       `sku`, `ean` o `handle` (este solo para productos de UNA variante).
 *   - `stock`: entero ≥ 0 (granel: en gramos, como en catalog:import).
 *   - `modo` (opcional): `sumar` o `fijar`. Vacío = el modo de la orden (`sumar` por defecto).
 * Se respeta lo reservado por pedidos en curso: al fijar por debajo de lo reservado, se avisa.
 */

export const STOCK_MODES = ["sumar", "fijar"] as const;
export type StockMode = (typeof STOCK_MODES)[number];

export interface StockRow {
  line: number;
  sku?: string;
  ean?: string;
  handle?: string;
  quantity: number;
  mode: StockMode;
}

export interface SheetIssue {
  line: number;
  message: string;
}

const COLUMNS = ["sku", "ean", "handle", "stock", "modo"] as const;
const INT = /^\d+$/;

/** Lee la hoja. `defaultMode`: el de la orden (`sumar` salvo que se pida `fijar`). */
export function readStockSheet(
  text: string,
  defaultMode: StockMode = "sumar",
): { rows: StockRow[]; errors: SheetIssue[] } {
  const errors: SheetIssue[] = [];
  const table = parseCsv(text);
  const [head, ...body] = table.rows.filter((r) => !isCommentCell(r.cells[0]));
  if (!head) return { rows: [], errors: [{ line: 1, message: "La hoja está vacía." }] };
  const names = head.cells.map((c) => c.trim().toLowerCase());
  const unknown = names.filter((n) => n && !(COLUMNS as readonly string[]).includes(n));
  if (unknown.length) {
    errors.push({ line: head.line, message: `Columnas desconocidas: ${unknown.join(", ")}.` });
  }
  if (!names.includes("stock"))
    errors.push({ line: head.line, message: "Falta la columna stock." });
  if (!["sku", "ean", "handle"].some((c) => names.includes(c))) {
    errors.push({ line: head.line, message: "Falta una columna sku, ean o handle." });
  }
  if (errors.length) return { rows: [], errors };
  const col = (cells: string[], name: string) => {
    const i = names.indexOf(name);
    return i === -1 ? "" : (cells[i] ?? "").trim();
  };

  const rows: StockRow[] = [];
  for (const { line, cells } of body) {
    if (cells.every((c) => !c.trim())) continue;
    const sku = col(cells, "sku");
    const ean = col(cells, "ean");
    const handle = col(cells, "handle").toLowerCase();
    const stock = col(cells, "stock");
    const modo = col(cells, "modo").toLowerCase();
    if (!sku && !ean && !handle) {
      errors.push({ line, message: "Falta el sku, el ean o el handle." });
      continue;
    }
    if (!INT.test(stock)) {
      errors.push({ line, message: "stock: un número entero ≥ 0 (granel, en gramos)." });
      continue;
    }
    if (modo && !(STOCK_MODES as readonly string[]).includes(modo)) {
      errors.push({ line, message: "modo: «sumar» o «fijar» (o vacío)." });
      continue;
    }
    rows.push({
      line,
      ...(sku ? { sku } : {}),
      ...(ean ? { ean } : {}),
      ...(handle ? { handle } : {}),
      quantity: Number(stock),
      mode: (modo || defaultMode) as StockMode,
    });
  }
  return { rows, errors };
}

/** Variante de Medusa con su nivel de inventario (el de la única ubicación de la tienda). */
export interface StockVariant {
  id: string;
  sku: string | null;
  ean: string | null;
  handle: string;
  title: string;
  /** Variantes del producto (para «handle» solo vale si es 1). */
  siblings: number;
  manageInventory: boolean;
  level: {
    id: string;
    inventoryItemId: string;
    locationId: string;
    stocked: number;
    reserved: number;
  } | null;
}

export interface StockChange {
  line: number;
  variant: StockVariant;
  mode: StockMode;
  quantity: number;
  before: number;
  after: number;
}

export interface StockPlan {
  changes: StockChange[];
  /** Sin cambios (sumar 0 o fijar el mismo stock). */
  unchanged: number;
  errors: SheetIssue[];
  warnings: SheetIssue[];
}

/** Busca cada fila en las variantes de Medusa y calcula el stock resultante. */
export function planStock(rows: StockRow[], variants: StockVariant[]): StockPlan {
  const bySku = new Map(variants.filter((v) => v.sku).map((v) => [v.sku!.toLowerCase(), v]));
  const byEan = new Map(variants.filter((v) => v.ean).map((v) => [v.ean!, v]));
  const byHandle = new Map<string, StockVariant[]>();
  for (const v of variants) byHandle.set(v.handle, [...(byHandle.get(v.handle) ?? []), v]);

  const errors: SheetIssue[] = [];
  const warnings: SheetIssue[] = [];
  const changes: StockChange[] = [];
  const seen = new Map<string, number>();
  // Stock acumulado por variante dentro de la misma hoja (dos filas de la misma variante)
  const current = new Map<string, number>();
  let unchanged = 0;

  for (const r of rows) {
    let v: StockVariant | undefined;
    if (r.sku) {
      v = bySku.get(r.sku.toLowerCase());
      if (!v) {
        errors.push({ line: r.line, message: `No hay ninguna variante con el SKU «${r.sku}».` });
        continue;
      }
      if (r.ean && v.ean !== r.ean) {
        warnings.push({ line: r.line, message: `El EAN no es el de ese SKU: se usa el SKU.` });
      }
      if (r.handle && v.handle !== r.handle) {
        warnings.push({ line: r.line, message: `El handle no es el de ese SKU: se usa el SKU.` });
      }
    } else if (r.ean) {
      v = byEan.get(r.ean);
      if (!v) {
        errors.push({ line: r.line, message: `No hay ninguna variante con el EAN «${r.ean}».` });
        continue;
      }
    } else {
      const list = byHandle.get(r.handle!) ?? [];
      if (!list.length) {
        errors.push({ line: r.line, message: `No hay ningún producto «${r.handle}».` });
        continue;
      }
      if (list.length > 1 || list[0]!.siblings > 1) {
        errors.push({
          line: r.line,
          message: `«${r.handle}» tiene varias variantes: indica el sku o el ean de cada una.`,
        });
        continue;
      }
      v = list[0]!;
    }
    if (!v.manageInventory || !v.level) {
      errors.push({
        line: r.line,
        message: `«${v.sku ?? v.handle}» no lleva control de stock (sin_stock o sin inventario).`,
      });
      continue;
    }
    const prev = seen.get(v.id);
    if (prev !== undefined) {
      warnings.push({
        line: r.line,
        message: `La variante ya estaba en la línea ${prev}: se aplican las dos, en orden.`,
      });
    }
    seen.set(v.id, r.line);
    const before = current.get(v.id) ?? v.level.stocked;
    const after = r.mode === "sumar" ? before + r.quantity : r.quantity;
    current.set(v.id, after);
    if (after < v.level.reserved) {
      warnings.push({
        line: r.line,
        message: `«${v.sku ?? v.handle}»: ${after} es menos que lo reservado por pedidos en curso (${v.level.reserved}); no se podrá vender hasta reponer.`,
      });
    }
    if (after === before) {
      unchanged++;
      continue;
    }
    changes.push({ line: r.line, variant: v, mode: r.mode, quantity: r.quantity, before, after });
  }
  return { changes, unchanged, errors, warnings };
}

/** Un nivel de inventario por variante: el último valor si la hoja la repite. */
export function finalLevels(changes: StockChange[]) {
  const last = new Map<string, StockChange>();
  for (const c of changes) last.set(c.variant.id, c);
  return [...last.values()].map((c) => ({
    id: c.variant.level!.id,
    inventory_item_id: c.variant.level!.inventoryItemId,
    location_id: c.variant.level!.locationId,
    stocked_quantity: c.after,
  }));
}
