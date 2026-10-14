/**
 * Lectura y validación de las hojas del importador de catálogo (`catalog:import`).
 * Solo mira las hojas (sin BD): formato de cada celda, columnas, herencia de precios y
 * medidas dentro de un producto, combinaciones de opciones… Lo que depende de la BD
 * (categorías existentes, SKU de otro producto…) se valida en `catalog-plan.ts`.
 * Formato de las hojas: `apps/backend/catalog/plantilla/LEEME.md`.
 *
 * Convención de celdas: vacía = «no tocar» (o heredar, en las columnas heredables);
 * `-` = borrar el valor.
 */
import type { CsvTable } from "./csv";

export interface SheetIssue {
  file: string;
  line: number;
  column?: string;
  message: string;
}

/** `undefined` = no tocar · `null` = borrar (`-`) · string = nuevo valor. */
export type Text = string | null | undefined;

export type Iva = "general" | "reducido" | "superreducido";
export type Status = "published" | "draft";

export interface CategorySheet {
  line: number;
  handle: string;
  name?: string;
  /** `undefined` = columna ausente (no tocar) · `null` = raíz. */
  parent?: string | null;
  description?: Text;
  rank?: number;
  active?: boolean;
}

export interface VariantSheet {
  line: number;
  sku: string;
  ean?: Text;
  /** Título de la opción → valor. */
  values: Record<string, string>;
  /** Precio de UNA unidad de venta (en granel, un paso de `paso_g`). */
  price: number;
  /** `undefined` = columna ausente · `null` = sin oferta. */
  salePrice?: number | null;
  /** Solo se usa al crear la variante (en granel, unidades = gramos). */
  stock?: number;
  weight?: number | null;
  length?: number | null;
  width?: number | null;
  height?: number | null;
  /** Contenido neto (para el €/kg o €/l): `null` = borrar. */
  netG?: number | null;
  netMl?: number | null;
  /** Granel: la unidad de venta es un paso de `stepG` gramos; el stock va en gramos. */
  bulk?: { stepG: number; minG: number; priceKg: number; salePriceKg?: number | null };
}

/** Componentes analíticos filtrables (metadata numérica del producto). */
export const ANALYTIC_COLUMNS = [
  "proteina_pct",
  "grasa_pct",
  "fibra_pct",
  "cenizas_pct",
  "humedad_pct",
] as const;
export type AnalyticColumn = (typeof ANALYTIC_COLUMNS)[number];
export const ANALYTIC_PREFIX = "analitico:";

export interface ProductSheet {
  line: number;
  handle: string;
  title?: string;
  subtitle?: Text;
  description?: Text;
  /** Handles de categoría; `null` = quitar todas. */
  categories?: string[] | null;
  tags?: string[] | null;
  iva?: Iva;
  collection?: string | null;
  status?: Status;
  material?: Text;
  brand?: Text;
  /** Porcentajes (0–100): `null` = borrar. */
  analytics: Partial<Record<AnalyticColumn, number | null>>;
  /** Otros componentes solo para la ficha (`analitico:Calcio` → «1,2 %»): `null` = borrar. */
  extraAnalytics: Record<string, string | null>;
  /** Producto a granel (todas sus variantes). */
  bulk?: boolean;
  /**
   * Descatalogado (Fase E): sigue publicado (su URL no da 404) pero sale de listados, búsqueda y
   * sitemap, y no se puede comprar. `undefined` = no tocar.
   */
  discontinued?: boolean;
  /** Handle del producto que lo sustituye (enlace en su ficha): `null` = borrar. */
  replacement?: Text;
  /** Títulos de las opciones del producto, en el orden de las columnas. */
  options: string[];
  variants: VariantSheet[];
}

export const CATEGORIES_FILE = "categorias.csv";
export const PRODUCTS_FILE = "productos.csv";
export const OPTION_PREFIX = "opcion:";
export const CLEAR = "-";

export const HANDLE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/**
 * Handles de producto reservados por páginas del storefront: /producto/correa-a-medida/ es la
 * página de grupo de las correas (Fase E-2c; el build del storefront también lo comprueba).
 */
export const RESERVED_PRODUCT_HANDLES = new Set(["correa-a-medida"]);

/** Minúsculas y sin acentos (cabeceras y comparación de valores). */
export const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const CATEGORY_COLUMNS = ["handle", "nombre", "padre", "descripcion", "orden", "activa"] as const;
const PRODUCT_COLUMNS = [
  "handle",
  "titulo",
  "subtitulo",
  "descripcion",
  "categorias",
  "etiquetas",
  "iva",
  "coleccion",
  "estado",
  "material",
  "marca",
  ...ANALYTIC_COLUMNS,
  "granel",
  "descatalogado",
  "sustituto",
  "sku",
  "ean",
  "precio",
  "precio_oferta",
  "stock",
  "peso_g",
  "largo_mm",
  "ancho_mm",
  "alto_mm",
  "neto_g",
  "neto_ml",
  "paso_g",
  "min_g",
  "precio_kg",
  "precio_oferta_kg",
  "stock_g",
] as const;
type ProductColumn = (typeof PRODUCT_COLUMNS)[number];

const PRODUCT_LEVEL: ProductColumn[] = [
  "titulo",
  "subtitulo",
  "descripcion",
  "categorias",
  "etiquetas",
  "iva",
  "coleccion",
  "estado",
  "material",
  "marca",
  ...ANALYTIC_COLUMNS,
  "granel",
  "descatalogado",
  "sustituto",
];
/** Columnas de variante que heredan el valor de la fila de arriba (mismo producto). */
type Inherited =
  | "precio"
  | "precio_oferta"
  | "peso_g"
  | "largo_mm"
  | "ancho_mm"
  | "alto_mm"
  | "neto_g"
  | "neto_ml"
  | "paso_g"
  | "min_g"
  | "precio_kg"
  | "precio_oferta_kg";

const IVA: Record<string, Iva> = {
  general: "general",
  reducido: "reducido",
  superreducido: "superreducido",
};
const STATUS: Record<string, Status> = {
  publicado: "published",
  borrador: "draft",
};
const BOOL: Record<string, boolean> = {
  si: true,
  no: false,
  "1": true,
  "0": false,
};

const PRICE_RE = /^\d+(?:[.,]\d{1,2})?$/;
const DECIMAL_RE = /^\d+(?:[.,]\d+)?$/;
const INT_RE = /^\d+$/;

/** «19,95», «19.95» o «19,95 €» → 19.95. `null` si no es válido. */
export function parsePrice(raw: string): number | null {
  const s = raw.replace(/\s*€$/, "").trim();
  if (!PRICE_RE.test(s)) return null;
  return Math.round(Number(s.replace(",", ".")) * 100) / 100;
}

/**
 * Precio de un paso de granel en euros, solo si sale en céntimos exactos
 * (`precio_kg × paso_g / 1000`). Se calcula en céntimos enteros para no arrastrar decimales.
 */
export function stepPrice(priceKg: number, stepG: number): number | null {
  const centsKg = Math.round(priceKg * 100);
  const num = centsKg * stepG;
  return num % 1000 === 0 ? num / 1000 / 100 : null;
}

/** Mensaje con alternativas cuando el precio por kilo no cuadra con el paso. */
export function bulkPriceHint(priceKg: number, stepG: number): string {
  const centsKg = Math.round(priceKg * 100);
  const fmt = (c: number) => (c / 100).toFixed(2).replace(".", ",");
  // Precio por kilo: múltiplo de 1000 / mcd(paso, 1000) céntimos
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const quantum = 1000 / gcd(stepG, 1000);
  const below = Math.floor(centsKg / quantum) * quantum;
  const above = below + quantum;
  const steps = [1, 2, 4, 5, 8, 10, 20, 25, 40, 50, 100].filter(
    (s) => s !== stepG && (centsKg * s) % 1000 === 0,
  );
  return (
    `${fmt(centsKg)} €/kg con un paso de ${stepG} g no da céntimos exactos ` +
    `(${fmt((centsKg * stepG) / 10)} céntimos). Opciones: ` +
    [
      ...(below > 0 ? [`${fmt(below)} €/kg`] : []),
      `${fmt(above)} €/kg`,
      ...(steps.length ? [`paso de ${steps.slice(0, 3).join(", ")} g`] : []),
    ].join(" · ") +
    "."
  );
}

function parseDecimal(raw: string): number | null {
  return DECIMAL_RE.test(raw) ? Number(raw.replace(",", ".")) : null;
}

const list = (raw: string) =>
  [
    ...new Set(
      raw
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ].sort();

const text = (raw: string): Text => (raw === "" ? undefined : raw === CLEAR ? null : raw);

interface Header<C extends string> {
  index: Map<C, number>;
  options: { title: string; index: number }[];
  /** Columnas `analitico:…` (solo productos). */
  extras: { title: string; index: number }[];
}

function readHeader<C extends string>(
  file: string,
  table: CsvTable,
  allowed: readonly C[],
  required: readonly C[],
  allowOptions: boolean,
  errors: SheetIssue[],
): Header<C> | null {
  const header = table.rows[0];
  if (!header) {
    errors.push({ file, line: 1, message: "El fichero está vacío." });
    return null;
  }
  const index = new Map<C, number>();
  const options: Header<C>["options"] = [];
  const extras: Header<C>["extras"] = [];
  const seenOptions = new Set<string>();
  const seenExtras = new Set<string>();
  header.cells.forEach((raw, i) => {
    const name = fold(raw);
    if (!name) return;
    if (allowOptions && name.startsWith(ANALYTIC_PREFIX)) {
      const title = raw.trim().slice(ANALYTIC_PREFIX.length).trim();
      if (!title) {
        errors.push({ file, line: 1, column: raw, message: "Falta el nombre del componente." });
      } else if (seenExtras.has(fold(title))) {
        errors.push({ file, line: 1, column: raw, message: "Componente repetido." });
      } else {
        seenExtras.add(fold(title));
        extras.push({ title, index: i });
      }
      return;
    }
    if (allowOptions && name.startsWith(OPTION_PREFIX)) {
      const title = raw.trim().slice(OPTION_PREFIX.length).trim();
      if (!title) {
        errors.push({ file, line: 1, column: raw, message: "Falta el nombre de la opción." });
      } else if (seenOptions.has(fold(title))) {
        errors.push({ file, line: 1, column: raw, message: "Opción repetida." });
      } else {
        seenOptions.add(fold(title));
        options.push({ title, index: i });
      }
      return;
    }
    const col = (allowed as readonly string[]).find((c) => c === name) as C | undefined;
    if (!col) {
      errors.push({
        file,
        line: 1,
        column: raw,
        message: allowOptions
          ? `Columna desconocida (¿errata? las opciones van como «${OPTION_PREFIX}Nombre»).`
          : "Columna desconocida.",
      });
    } else if (index.has(col)) {
      errors.push({ file, line: 1, column: raw, message: "Columna repetida." });
    } else {
      index.set(col, i);
    }
  });
  for (const col of required) {
    if (!index.has(col)) errors.push({ file, line: 1, column: col, message: "Falta la columna." });
  }
  return { index, options, extras };
}

const isBlank = (cells: string[]) => cells.every((c) => c.trim() === "");

/**
 * Más celdas con datos que columnas: casi siempre un decimal con coma sin comillas en un CSV
 * separado por comas (`9,95` → dos celdas). Error en vez de perder datos en silencio.
 */
function extraCells(file: string, table: CsvTable, row: { line: number; cells: string[] }) {
  const width = table.rows[0]?.cells.length ?? 0;
  if (!row.cells.slice(width).some((c) => c.trim() !== "")) return null;
  return {
    file,
    line: row.line,
    message:
      `La fila tiene ${row.cells.length} celdas y la cabecera ${width}. ` +
      `¿Un decimal con coma sin comillas («9,95» → "9,95") o un separador «${table.delimiter}» dentro de un texto?`,
  };
}

/** Hoja de categorías. */
export function readCategories(table: CsvTable, file = CATEGORIES_FILE) {
  const errors: SheetIssue[] = [];
  const warnings: SheetIssue[] = [];
  const categories: CategorySheet[] = [];
  const header = readHeader(file, table, CATEGORY_COLUMNS, ["handle", "nombre"], false, errors);
  if (!header) return { categories, errors, warnings };
  const has = (c: (typeof CATEGORY_COLUMNS)[number]) => header.index.has(c);

  const seen = new Map<string, number>();
  for (const row of table.rows.slice(1)) {
    if (isBlank(row.cells)) continue;
    const extra = extraCells(file, table, row);
    if (extra) {
      errors.push(extra);
      continue;
    }
    const cell = (c: (typeof CATEGORY_COLUMNS)[number]) =>
      (header.index.has(c) ? (row.cells[header.index.get(c) as number] ?? "") : "").trim();
    const err = (column: string, message: string) =>
      errors.push({ file, line: row.line, column, message });

    const handle = cell("handle");
    if (!HANDLE_RE.test(handle)) {
      err("handle", "Handle no válido: minúsculas, números y guiones (p. ej. «ropa-hombre»).");
      continue;
    }
    if (seen.has(handle)) {
      err("handle", `Handle repetido (ya está en la línea ${seen.get(handle)}).`);
      continue;
    }
    seen.set(handle, row.line);

    const cat: CategorySheet = { line: row.line, handle };
    const name = cell("nombre");
    if (name) cat.name = name;
    for (const [column, value] of [
      ["nombre", name],
      ["descripcion", cell("descripcion")],
    ] as const) {
      if (/^\p{Ll}/u.test(value)) {
        warnings.push({
          file,
          line: row.line,
          column,
          message: `Empieza en minúscula («${value}»).`,
        });
      }
    }
    if (has("padre")) {
      const parent = cell("padre");
      if (parent === handle) err("padre", "Una categoría no puede ser su propio padre.");
      cat.parent = parent || null;
    }
    if (has("descripcion")) cat.description = text(cell("descripcion"));
    const orden = cell("orden");
    if (orden) {
      if (INT_RE.test(orden)) cat.rank = Number(orden);
      else err("orden", "Debe ser un número entero (0, 1, 2…).");
    }
    const activa = fold(cell("activa"));
    if (activa) {
      if (activa in BOOL) cat.active = BOOL[activa];
      else err("activa", "Valores válidos: sí / no.");
    }
    categories.push(cat);
  }

  // Ciclos dentro de la hoja (a → b → a)
  const byHandle = new Map(categories.map((c) => [c.handle, c]));
  for (const cat of categories) {
    const path = new Set<string>([cat.handle]);
    for (let p = cat.parent; p; p = byHandle.get(p)?.parent) {
      if (path.has(p)) {
        errors.push({
          file,
          line: cat.line,
          column: "padre",
          message: `Ciclo de categorías: ${[...path, p].join(" → ")}.`,
        });
        break;
      }
      path.add(p);
    }
  }
  return { categories, errors, warnings };
}

/** Hoja de productos (una fila por variante). */
export function readProducts(table: CsvTable, file = PRODUCTS_FILE) {
  const errors: SheetIssue[] = [];
  const warnings: SheetIssue[] = [];
  const products: ProductSheet[] = [];
  const header = readHeader(file, table, PRODUCT_COLUMNS, ["handle", "sku"], true, errors);
  if (!header) return { products, errors, warnings };
  const has = (c: ProductColumn) => header.index.has(c);

  const seenHandles = new Map<string, number>();
  const seenSkus = new Map<string, number>();
  const seenEans = new Map<string, number>();
  let current = null as ProductSheet | null;
  let firstCells: Partial<Record<ProductColumn, string>> = {};
  let inherited: Partial<Record<Inherited, string>> = {};
  const combos = new Map<string, number>();

  const finish = (p: ProductSheet | null) => {
    if (!p) return;
    // Opciones del producto = columnas con valor en alguna de sus filas
    p.options = header.options
      .map((o) => o.title)
      .filter((t) => p.variants.some((v) => v.values[t] !== undefined));
    for (const v of p.variants) {
      const missing = p.options.filter((t) => v.values[t] === undefined);
      if (missing.length) {
        errors.push({
          file,
          line: v.line,
          column: `${OPTION_PREFIX}${missing[0]}`,
          message: `Falta el valor de ${missing.join(", ")} (todas las variantes del producto necesitan las mismas opciones).`,
        });
      }
    }
    if (!p.options.length && p.variants.length > 1) {
      errors.push({
        file,
        line: p.line,
        message: "Un producto con varias filas necesita al menos una columna «opcion:…» rellena.",
      });
    }
    products.push(p);
  };

  for (const row of table.rows.slice(1)) {
    if (isBlank(row.cells)) continue;
    const extra = extraCells(file, table, row);
    if (extra) {
      errors.push(extra);
      continue;
    }
    const cell = (c: ProductColumn) =>
      (has(c) ? (row.cells[header.index.get(c) as number] ?? "") : "").trim();
    const flagged = new Set<string>();
    const err = (column: string, message: string) => {
      if (flagged.has(column)) return; // un solo error por celda
      flagged.add(column);
      errors.push({ file, line: row.line, column, message });
    };
    const handle = cell("handle");
    if (!HANDLE_RE.test(handle)) {
      err("handle", "Handle no válido: minúsculas, números y guiones (p. ej. «camiseta-basica»).");
      continue;
    }
    if (RESERVED_PRODUCT_HANDLES.has(handle)) {
      err("handle", `«${handle}» está reservado por la tienda (página de grupo): usa otro.`);
      continue;
    }

    // ¿Producto nuevo en la hoja?
    if (current?.handle !== handle) {
      if (seenHandles.has(handle)) {
        err(
          "handle",
          `Las filas del producto deben ir seguidas (ya apareció en la línea ${seenHandles.get(handle)}).`,
        );
        continue;
      }
      finish(current);
      seenHandles.set(handle, row.line);
      current = {
        line: row.line,
        handle,
        options: [],
        variants: [],
        analytics: {},
        extraAnalytics: {},
      };
      firstCells = Object.fromEntries(PRODUCT_LEVEL.map((c) => [c, cell(c)]));
      inherited = {};
      combos.clear();

      const p = current;
      const title = cell("titulo");
      if (title) {
        p.title = title;
        if (/^\p{Ll}/u.test(title)) {
          warnings.push({
            file,
            line: row.line,
            column: "titulo",
            message: `Empieza en minúscula («${title}»): Medusa ordena distinguiendo mayúsculas y saldría al final.`,
          });
        }
      }
      if (has("subtitulo")) p.subtitle = text(cell("subtitulo"));
      if (has("descripcion")) p.description = text(cell("descripcion"));
      if (has("material")) p.material = text(cell("material"));
      if (has("marca")) p.brand = text(cell("marca"));
      for (const [col, key] of [
        ["categorias", "categories"],
        ["etiquetas", "tags"],
      ] as const) {
        const raw = cell(col);
        if (raw === CLEAR) p[key] = null;
        else if (raw) p[key] = list(raw);
      }
      for (const c of p.categories ?? []) {
        if (!HANDLE_RE.test(c)) err("categorias", `Handle de categoría no válido: «${c}».`);
      }
      const coleccion = cell("coleccion");
      if (coleccion === CLEAR) p.collection = null;
      else if (coleccion) p.collection = coleccion;
      const iva = fold(cell("iva"));
      if (iva) {
        if (iva in IVA) p.iva = IVA[iva];
        else err("iva", "Valores válidos: general / reducido / superreducido.");
      }
      const estado = fold(cell("estado"));
      if (estado) {
        if (estado in STATUS) p.status = STATUS[estado];
        else err("estado", "Valores válidos: publicado / borrador.");
      }
      const granel = fold(cell("granel"));
      if (granel) {
        if (granel in BOOL) p.bulk = BOOL[granel];
        else err("granel", "Valores válidos: sí / no.");
      }
      const descatalogado = fold(cell("descatalogado"));
      if (descatalogado) {
        if (descatalogado in BOOL) p.discontinued = BOOL[descatalogado];
        else err("descatalogado", "Valores válidos: sí / no.");
      }
      if (has("sustituto")) {
        const sustituto = text(cell("sustituto"));
        if (sustituto && !HANDLE_RE.test(sustituto)) {
          err("sustituto", `Handle de producto no válido: «${sustituto}».`);
        } else if (sustituto === handle) {
          err("sustituto", "Un producto no puede ser su propio sustituto.");
        } else if (sustituto !== undefined) p.replacement = sustituto;
      }

      // Componentes analíticos (% sobre producto tal cual)
      for (const c of ANALYTIC_COLUMNS) {
        const raw = cell(c);
        if (!raw) continue;
        if (raw === CLEAR) {
          p.analytics[c] = null;
          continue;
        }
        const n = parseDecimal(raw.replace(/\s*%$/, ""));
        if (n === null || n > 100) err(c, `Porcentaje no válido (0–100): «${raw}».`);
        else p.analytics[c] = n;
      }
      const values = Object.values(p.analytics).filter((n): n is number => typeof n === "number");
      const sum = values.reduce((a, b) => a + b, 0);
      if (sum > 100) {
        warnings.push({
          file,
          line: row.line,
          message: `Los componentes analíticos suman ${sum} % (más de 100).`,
        });
      }
      if (
        p.analytics.humedad_pct === undefined &&
        ANALYTIC_COLUMNS.some((c) => c !== "humedad_pct" && typeof p.analytics[c] === "number")
      ) {
        warnings.push({
          file,
          line: row.line,
          column: "humedad_pct",
          message: "Sin humedad no se podrá calcular el filtro sobre materia seca.",
        });
      }
      for (const x of header.extras) {
        const raw = (row.cells[x.index] ?? "").trim();
        if (raw) p.extraAnalytics[x.title] = raw === CLEAR ? null : raw;
      }
    } else {
      // Filas siguientes: los datos del producto, vacíos o iguales a la primera fila
      for (const x of header.extras) {
        if ((row.cells[x.index] ?? "").trim()) {
          err(`${ANALYTIC_PREFIX}${x.title}`, "Dato del producto: va solo en su primera fila.");
        }
      }
      for (const c of PRODUCT_LEVEL) {
        const v = cell(c);
        if (v && v !== firstCells[c]) {
          err(
            c,
            "Dato del producto distinto al de su primera fila: déjalo vacío en las variantes.",
          );
        }
      }
    }
    const product = current;

    // Variante
    const sku = cell("sku");
    if (!sku) {
      err("sku", "Falta el SKU (identifica la variante para poder volver a cargar la hoja).");
    } else if (seenSkus.has(sku)) {
      err("sku", `SKU repetido (ya está en la línea ${seenSkus.get(sku)}).`);
    } else {
      seenSkus.set(sku, row.line);
    }

    const values: Record<string, string> = {};
    for (const o of header.options) {
      const v = (row.cells[o.index] ?? "").trim();
      if (v) values[o.title] = v;
    }
    const comboKey = header.options.map((o) => fold(values[o.title] ?? "")).join("\u0000");
    if (combos.has(comboKey)) {
      err(
        "opciones",
        `Combinación de opciones repetida en el producto (línea ${combos.get(comboKey)}).`,
      );
    } else {
      combos.set(comboKey, row.line);
    }

    // Columnas heredables
    const take = (c: Inherited) => {
      const own = cell(c);
      if (own) inherited[c] = own;
      return inherited[c];
    };
    const bulk = product.bulk === true;
    const rawPrice = take("precio");
    let price = 0;
    if (bulk) {
      if (cell("precio") || cell("precio_oferta") || cell("stock")) {
        err(
          cell("precio") ? "precio" : cell("precio_oferta") ? "precio_oferta" : "stock",
          "Producto a granel: usa precio_kg, precio_oferta_kg y stock_g.",
        );
      }
    } else if (!rawPrice) {
      err("precio", "Falta el precio (en la primera variante del producto es obligatorio).");
    } else {
      const parsed = parsePrice(rawPrice);
      if (parsed === null || parsed <= 0) err("precio", `Precio no válido: «${rawPrice}».`);
      else price = parsed;
    }
    if (!bulk) {
      for (const c of ["paso_g", "min_g", "precio_kg", "precio_oferta_kg", "stock_g"] as const) {
        if (cell(c)) err(c, "Solo para productos a granel (columna granel = sí).");
      }
    }

    let salePrice: number | null | undefined;
    if (has("precio_oferta") && !bulk) {
      // La oferta va con su precio: si la fila escribe su propio precio, no se hereda.
      if (cell("precio") && !cell("precio_oferta")) delete inherited.precio_oferta;
      const raw = take("precio_oferta");
      if (!raw || raw === CLEAR) salePrice = null;
      else {
        const parsed = parsePrice(raw);
        if (parsed === null || parsed <= 0) err("precio_oferta", `Precio no válido: «${raw}».`);
        else if (price && parsed >= price) {
          err("precio_oferta", `La oferta (${raw}) debe ser menor que el precio.`);
        } else salePrice = parsed;
      }
    }

    const measure = (c: "peso_g" | "largo_mm" | "ancho_mm" | "alto_mm" | "neto_g" | "neto_ml") => {
      if (!has(c)) return undefined;
      const raw = take(c);
      if (!raw) return undefined;
      if (raw === CLEAR) return null;
      const n = parseDecimal(raw);
      if (n === null) err(c, `Número no válido: «${raw}».`);
      return n ?? undefined;
    };

    const variant: VariantSheet = { line: row.line, sku, values, price };
    if (salePrice !== undefined) variant.salePrice = salePrice;
    if (has("ean")) {
      const ean = text(cell("ean"));
      if (ean !== undefined) variant.ean = ean;
      if (ean) {
        if (seenEans.has(ean))
          err("ean", `EAN repetido (ya está en la línea ${seenEans.get(ean)}).`);
        else seenEans.set(ean, row.line);
      }
    }
    const stock = cell("stock");
    if (stock) {
      if (INT_RE.test(stock)) variant.stock = Number(stock);
      else err("stock", "Debe ser un número entero ≥ 0.");
    }
    for (const [c, key] of [
      ["peso_g", "weight"],
      ["largo_mm", "length"],
      ["ancho_mm", "width"],
      ["alto_mm", "height"],
    ] as const) {
      const v = measure(c);
      if (v !== undefined) variant[key] = v;
    }
    const netG = measure("neto_g");
    const netMl = measure("neto_ml");
    if (typeof netG === "number" && typeof netMl === "number") {
      err("neto_ml", "Rellena neto_g O neto_ml, no los dos.");
    }
    if (netG !== undefined) variant.netG = netG;
    if (netMl !== undefined) variant.netMl = netMl;

    if (bulk) {
      const int = (c: "paso_g" | "min_g") => {
        const raw = take(c);
        if (!raw) return undefined;
        if (!INT_RE.test(raw) || Number(raw) < 1) {
          err(c, `Gramos enteros ≥ 1: «${raw}».`);
          return undefined;
        }
        return Number(raw);
      };
      const stepG = int("paso_g");
      const minG = int("min_g") ?? stepG;
      const rawKg = take("precio_kg");
      const priceKg = rawKg ? parsePrice(rawKg) : null;
      if (!stepG) err("paso_g", "Falta el paso en gramos (5, 10, 25…).");
      if (!rawKg) err("precio_kg", "Falta el precio por kilo.");
      else if (priceKg === null || priceKg <= 0) err("precio_kg", `Precio no válido: «${rawKg}».`);
      if (stepG && minG && minG % stepG !== 0) {
        err("min_g", `El mínimo (${minG} g) debe ser múltiplo del paso (${stepG} g).`);
      }
      // Oferta por kilo (la oferta va con su precio, como precio_oferta)
      if (cell("precio_kg") && !cell("precio_oferta_kg")) delete inherited.precio_oferta_kg;
      const rawSaleKg = has("precio_oferta_kg") ? take("precio_oferta_kg") : undefined;
      let salePriceKg: number | null | undefined = has("precio_oferta_kg") ? null : undefined;
      if (rawSaleKg && rawSaleKg !== CLEAR) {
        const parsed = parsePrice(rawSaleKg);
        if (parsed === null || parsed <= 0) {
          err("precio_oferta_kg", `Precio no válido: «${rawSaleKg}».`);
        } else if (priceKg && parsed >= priceKg) {
          err(
            "precio_oferta_kg",
            `La oferta (${rawSaleKg}) debe ser menor que el precio por kilo.`,
          );
        } else salePriceKg = parsed;
      }
      if (stepG && priceKg) {
        const unit = stepPrice(priceKg, stepG);
        if (unit === null) {
          err("precio_kg", bulkPriceHint(priceKg, stepG));
        } else {
          variant.price = unit;
          if (typeof salePriceKg === "number") {
            const saleUnit = stepPrice(salePriceKg, stepG);
            if (saleUnit === null) err("precio_oferta_kg", bulkPriceHint(salePriceKg, stepG));
            else variant.salePrice = saleUnit;
          } else if (salePriceKg === null) {
            variant.salePrice = null;
          }
        }
        variant.bulk = {
          stepG,
          minG: minG ?? stepG,
          priceKg,
          ...(salePriceKg !== undefined ? { salePriceKg } : {}),
        };
      }
      const stockG = cell("stock_g");
      if (stockG) {
        if (INT_RE.test(stockG)) variant.stock = Number(stockG);
        else err("stock_g", "Gramos enteros ≥ 0.");
      }
    }

    // Con errores también se guarda (para comprobar las opciones del producto); si hay un solo
    // error en las hojas no se importa nada.
    product.variants.push(variant);
  }
  finish(current);
  return { products, errors, warnings };
}
