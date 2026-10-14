/**
 * Hojas de la correa a medida (Fase E-2) para `correas:sync`. Funciones puras (sin BD).
 * Formato: `catalog/plantilla/correas/LEEME.md`. Una carpeta con cinco CSV:
 *
 *   correas.csv     una fila por producto (color × material): handle, titulo, color, color_hex,
 *                   material, precio_3m, gramos_m, sku_cuerda, estado, descripcion, stock_inicial
 *   largos.csv      largo_m, suplemento (euros que se suman al precio de 3 m)
 *   mosquetones.csv codigo, nombre, recargo (por mosquetón), sku, stock_inicial
 *   piezas.csv      sku, nombre, por_correa, stock_inicial (anillas, hebillas…)
 *   ajustes.csv     clave, valor: categoria, peso_fijo_g, cuerda_extra_m
 *
 * `stock_inicial` solo se usa al CREAR el artículo de inventario (igual que `stock` en
 * `catalog:import`): volver a sincronizar nunca cambia el stock.
 */
import { type CsvTable, parseCsv } from "./csv";
import {
  HANDLE_RE,
  RESERVED_PRODUCT_HANDLES,
  fold,
  parsePrice,
  type SheetIssue,
  type Status,
} from "./catalog-sheet";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export const CORREA_FILES = {
  products: "correas.csv",
  lengths: "largos.csv",
  clips: "mosquetones.csv",
  parts: "piezas.csv",
  settings: "ajustes.csv",
} as const;

export interface CorreaSettings {
  category: string;
  fixedG: number;
  extraM: number;
}

export interface CorreaLength {
  m: number;
  supplement: number;
}

export interface CorreaClip {
  code: string;
  name: string;
  surcharge: number;
  sku: string;
  stock: number;
}

export interface CorreaPart {
  sku: string;
  name: string;
  perCorrea: number;
  stock: number;
}

export interface CorreaProductSheet {
  line: number;
  handle: string;
  title: string;
  color: string;
  /** Color para pintar la muestra en la tienda («#1E5AA8»), o null. */
  colorHex: string | null;
  material: string;
  basePrice: number;
  gramsPerM: number;
  ropeSku: string;
  status: Status;
  description: string | null;
  /** Metros del rollo abierto al crear la cuerda. */
  stock: number;
}

export interface CorreaSheets {
  settings: CorreaSettings;
  lengths: CorreaLength[];
  clips: CorreaClip[];
  parts: CorreaPart[];
  products: CorreaProductSheet[];
}

const SKU_RE = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const CODE_RE = /^[A-Z]{2,4}$/;
const INT_RE = /^\d+$/;
const DECIMAL_RE = /^\d+(?:[.,]\d+)?$/;
const decimal = (raw: string) => (DECIMAL_RE.test(raw) ? Number(raw.replace(",", ".")) : null);

interface Table {
  rows: { line: number; cell: (column: string) => string }[];
}

/** Cabecera exacta (sin mayúsculas ni acentos), columnas obligatorias y opcionales. */
function readTable(
  file: string,
  table: CsvTable,
  required: string[],
  optional: string[],
  errors: SheetIssue[],
): Table {
  const [header, ...body] = table.rows;
  if (!header) {
    errors.push({ file, line: 1, message: "El fichero está vacío." });
    return { rows: [] };
  }
  const index = new Map<string, number>();
  header.cells.forEach((raw, i) => {
    const name = fold(raw);
    if (!name) return;
    if (![...required, ...optional].includes(name)) {
      errors.push({ file, line: 1, column: raw, message: "Columna desconocida." });
    } else if (index.has(name)) {
      errors.push({ file, line: 1, column: raw, message: "Columna repetida." });
    } else {
      index.set(name, i);
    }
  });
  for (const col of required) {
    if (!index.has(col)) errors.push({ file, line: 1, column: col, message: "Falta la columna." });
  }
  return {
    rows: body
      .filter((r) => r.cells.some((c) => c.trim() !== ""))
      .map((r) => ({
        line: r.line,
        cell: (c: string) => (index.has(c) ? (r.cells[index.get(c) as number] ?? "").trim() : ""),
      })),
  };
}

function unique<T>(
  file: string,
  column: string,
  items: T[],
  key: (t: T) => string,
  line: (t: T) => number,
  errors: SheetIssue[],
) {
  const seen = new Map<string, number>();
  for (const it of items) {
    const k = key(it);
    if (seen.has(k)) {
      errors.push({
        file,
        line: line(it),
        column,
        message: `Repetido (ya está en la línea ${seen.get(k)}).`,
      });
    } else seen.set(k, line(it));
  }
}

const STATUS: Record<string, Status> = { publicado: "published", borrador: "draft" };

/** Lee y valida las cinco hojas. `texts`: nombre de fichero → contenido (null = no existe). */
export function readCorreaSheets(texts: Record<string, string | null>) {
  const errors: SheetIssue[] = [];
  const tables = Object.fromEntries(
    Object.values(CORREA_FILES).map((file) => {
      const text = texts[file];
      if (text === null || text === undefined) {
        errors.push({ file, line: 1, message: "Falta el fichero." });
        return [file, null];
      }
      try {
        return [file, parseCsv(text)];
      } catch (e) {
        errors.push({ file, line: 1, message: (e as Error).message });
        return [file, null];
      }
    }),
  ) as Record<string, CsvTable | null>;
  const table = (file: string, required: string[], optional: string[] = []) => {
    const t = tables[file];
    return t ? readTable(file, t, required, optional, errors) : { rows: [] };
  };
  const err = (file: string, line: number, column: string, message: string) =>
    errors.push({ file, line, column, message });

  // ajustes.csv
  const F = CORREA_FILES;
  const values = new Map<string, { value: string; line: number }>();
  for (const r of table(F.settings, ["clave", "valor"]).rows) {
    const key = fold(r.cell("clave"));
    if (!["categoria", "peso_fijo_g", "cuerda_extra_m"].includes(key)) {
      err(F.settings, r.line, "clave", `Clave desconocida «${r.cell("clave")}».`);
    } else values.set(key, { value: r.cell("valor"), line: r.line });
  }
  const setting = (key: string) => {
    const v = values.get(key);
    if (!v) err(F.settings, 1, "clave", `Falta la clave «${key}».`);
    return v;
  };
  const category = setting("categoria");
  if (category && !HANDLE_RE.test(category.value)) {
    err(F.settings, category.line, "valor", "Handle de categoría no válido.");
  }
  const fixed = setting("peso_fijo_g");
  if (fixed && !INT_RE.test(fixed.value)) {
    err(F.settings, fixed.line, "valor", "Gramos: número entero.");
  }
  const extra = setting("cuerda_extra_m");
  const extraM = extra ? decimal(extra.value) : null;
  if (extra && extraM === null) err(F.settings, extra.line, "valor", "Metros: 0,5 o 0.5.");
  const settings: CorreaSettings = {
    category: category?.value ?? "",
    fixedG: Number(fixed?.value ?? 0),
    extraM: extraM ?? 0,
  };

  // largos.csv
  const lengths: (CorreaLength & { line: number })[] = [];
  for (const r of table(F.lengths, ["largo_m", "suplemento"]).rows) {
    const m = r.cell("largo_m");
    const supplement = parsePrice(r.cell("suplemento"));
    if (!INT_RE.test(m) || Number(m) < 1 || Number(m) > 99) {
      err(F.lengths, r.line, "largo_m", "Metros enteros entre 1 y 99.");
    } else if (supplement === null) {
      err(F.lengths, r.line, "suplemento", "Euros (0 · 1,50 · 3).");
    } else lengths.push({ line: r.line, m: Number(m), supplement });
  }
  unique(
    F.lengths,
    "largo_m",
    lengths,
    (l) => String(l.m),
    (l) => l.line,
    errors,
  );
  lengths.sort((a, b) => a.m - b.m);
  if (tables[F.lengths] && !lengths.length) err(F.lengths, 1, "largo_m", "No hay ningún largo.");

  // mosquetones.csv
  const clips: (CorreaClip & { line: number })[] = [];
  for (const r of table(F.clips, ["codigo", "nombre", "recargo", "sku"], ["stock_inicial"]).rows) {
    const code = r.cell("codigo").toUpperCase();
    const surcharge = parsePrice(r.cell("recargo"));
    const stock = r.cell("stock_inicial");
    if (!CODE_RE.test(code)) err(F.clips, r.line, "codigo", "De 2 a 4 letras (EST, MON…).");
    else if (!r.cell("nombre")) err(F.clips, r.line, "nombre", "Obligatorio.");
    else if (surcharge === null) err(F.clips, r.line, "recargo", "Euros (0 · 3 · 5).");
    else if (!SKU_RE.test(r.cell("sku"))) {
      err(F.clips, r.line, "sku", "Mayúsculas, números y guiones.");
    } else if (stock && !INT_RE.test(stock)) err(F.clips, r.line, "stock_inicial", "Unidades.");
    else {
      clips.push({
        line: r.line,
        code,
        name: r.cell("nombre"),
        surcharge,
        sku: r.cell("sku"),
        stock: Number(stock || 0),
      });
    }
  }
  unique(
    F.clips,
    "codigo",
    clips,
    (c) => c.code,
    (c) => c.line,
    errors,
  );
  unique(
    F.clips,
    "nombre",
    clips,
    (c) => fold(c.name),
    (c) => c.line,
    errors,
  );
  if (tables[F.clips] && !clips.length) err(F.clips, 1, "codigo", "No hay ningún mosquetón.");

  // piezas.csv
  const parts: (CorreaPart & { line: number })[] = [];
  for (const r of table(F.parts, ["sku", "nombre", "por_correa"], ["stock_inicial"]).rows) {
    const per = r.cell("por_correa");
    const stock = r.cell("stock_inicial");
    if (!SKU_RE.test(r.cell("sku"))) err(F.parts, r.line, "sku", "Mayúsculas, números y guiones.");
    else if (!r.cell("nombre")) err(F.parts, r.line, "nombre", "Obligatorio.");
    else if (!INT_RE.test(per) || Number(per) < 1) {
      err(F.parts, r.line, "por_correa", "Unidades por correa (1, 2, 3…).");
    } else if (stock && !INT_RE.test(stock)) err(F.parts, r.line, "stock_inicial", "Unidades.");
    else {
      parts.push({
        line: r.line,
        sku: r.cell("sku"),
        name: r.cell("nombre"),
        perCorrea: Number(per),
        stock: Number(stock || 0),
      });
    }
  }

  // correas.csv
  const products: CorreaProductSheet[] = [];
  const productTable = table(
    F.products,
    ["handle", "titulo", "color", "material", "precio_3m", "gramos_m", "sku_cuerda"],
    ["estado", "descripcion", "stock_inicial", "color_hex"],
  );
  for (const r of productTable.rows) {
    const hex = r.cell("color_hex");
    const handle = r.cell("handle");
    const price = parsePrice(r.cell("precio_3m"));
    const grams = r.cell("gramos_m");
    const estado = fold(r.cell("estado"));
    const stock = r.cell("stock_inicial");
    const e = (c: string, m: string) => err(F.products, r.line, c, m);
    if (!HANDLE_RE.test(handle)) e("handle", "Minúsculas, números y guiones.");
    else if (RESERVED_PRODUCT_HANDLES.has(handle)) e("handle", "Está reservado por la tienda.");
    else if (!r.cell("titulo")) e("titulo", "Obligatorio.");
    else if (!r.cell("color")) e("color", "Obligatorio.");
    else if (hex && !HEX_RE.test(hex)) e("color_hex", "Color en hexadecimal (#1E5AA8).");
    else if (!r.cell("material")) e("material", "Obligatorio.");
    else if (price === null || price <= 0) e("precio_3m", "Euros con IVA (24,00).");
    else if (!INT_RE.test(grams)) e("gramos_m", "Gramos por metro de cuerda (entero).");
    else if (!SKU_RE.test(r.cell("sku_cuerda"))) {
      e("sku_cuerda", "Mayúsculas, números y guiones.");
    } else if (estado && !(estado in STATUS)) e("estado", "publicado / borrador.");
    else if (stock && decimal(stock) === null) e("stock_inicial", "Metros (25 · 12,5).");
    else {
      products.push({
        line: r.line,
        handle,
        title: r.cell("titulo"),
        color: r.cell("color"),
        colorHex: hex ? hex.toUpperCase() : null,
        material: r.cell("material"),
        basePrice: price,
        gramsPerM: Number(grams),
        ropeSku: r.cell("sku_cuerda"),
        status: STATUS[estado] ?? "published",
        description: r.cell("descripcion") || null,
        stock: decimal(stock) ?? 0,
      });
    }
  }
  unique(
    F.products,
    "handle",
    products,
    (p) => p.handle,
    (p) => p.line,
    errors,
  );
  unique(
    F.products,
    "sku_cuerda",
    products,
    (p) => p.ropeSku,
    (p) => p.line,
    errors,
  );
  unique(
    F.products,
    "color",
    products,
    (p) => `${fold(p.color)}|${fold(p.material)}`,
    (p) => p.line,
    errors,
  );

  // SKU de pieza únicos entre las tres hojas (una pieza = un artículo de inventario)
  const pieceSkus = [
    ...products.map((p) => ({ sku: p.ropeSku, file: F.products as string, line: p.line })),
    ...clips.map((c) => ({ sku: c.sku, file: F.clips as string, line: c.line })),
    ...parts.map((p) => ({ sku: p.sku, file: F.parts as string, line: p.line })),
  ];
  const seenSku = new Map<string, string>();
  for (const s of pieceSkus) {
    const prev = seenSku.get(s.sku);
    if (prev && prev !== `${s.file}:${s.line}`) {
      err(s.file, s.line, "sku", `SKU de pieza repetido (también en ${prev}).`);
    }
    seenSku.set(s.sku, `${s.file}:${s.line}`);
  }

  const strip = <T extends { line: number }>(items: T[]): Omit<T, "line">[] =>
    items.map((item) => {
      const rest: Partial<T> = { ...item };
      delete rest.line;
      return rest as Omit<T, "line">;
    });
  const sheets: CorreaSheets = {
    settings,
    lengths: strip(lengths),
    clips: strip(clips),
    parts: strip(parts),
    products,
  };
  return { sheets, errors };
}
