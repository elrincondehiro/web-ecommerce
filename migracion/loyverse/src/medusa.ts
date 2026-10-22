/**
 * Fase W (lógica pura, sin I/O): de la selección revisada (filas de `revision.csv` /
 * `por-categoria/*.csv` marcadas «sí») a las hojas de `catalog:import` del backend:
 * `productos.csv` (formato de apps/backend/catalog/plantilla/LEEME.md) + avisos.
 *
 * - Una fila por variante; filas del mismo producto seguidas; datos del producto solo en la
 *   primera fila.
 * - Producto = artículo de Loyverse, o varios artículos con el mismo `nombre_nuevo` (agrupados).
 * - Opciones de Loyverse → opciones de la tienda con `mapa-opciones.csv`; categorías de
 *   Loyverse → handles del árbol nuevo con `mapa-categorias.csv` (o `categoria_nueva`).
 * - Stock 0 (se cargará tras el inventario) y estado `publicado` (decisiones W).
 * - Handles propuestos desde el título; los que el usuario corrige en `handles.csv` se respetan.
 */
import type { Item } from "./types.ts";

// ── Handles ─────────────────────────────────────────────────────────────────────────────────

/** Mismo formato que el importador (catalog-sheet.ts, HANDLE_RE). */
export const HANDLE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Reservados por el storefront (RESERVED_PRODUCT_HANDLES del backend). */
const RESERVED = new Set(["correa-a-medida"]);
const HANDLE_MAX = 80;

export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ñ/g, "n")
    .replace(/&/g, " y ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length <= HANDLE_MAX) return slug;
  return slug.slice(0, HANDLE_MAX).replace(/-[^-]*$/, "");
}

/** Handle único: si ya existe, añade -2, -3… */
export function uniqueHandle(base: string, taken: Set<string>): string {
  let h = base || "producto";
  if (RESERVED.has(h)) h = `${h}-2`;
  for (let i = 2; taken.has(h); i++) h = `${base}-${i}`;
  taken.add(h);
  return h;
}

// ── Contenido neto desde el texto («400g», «2 kg», «1,5L») ──────────────────────────────────

export function parseNet(text: string): { g: number } | { ml: number } | null {
  const m = /(\d+(?:[.,]\d+)?)\s*(kg|kgs|g|gr|grs|gramos|l|lt|litros?|ml|cl)\b/i.exec(text);
  if (!m) return null;
  const n = Number(m[1]!.replace(",", "."));
  const unit = m[2]!.toLowerCase();
  if (!(n > 0)) return null;
  if (unit.startsWith("kg")) return { g: Math.round(n * 1000) };
  if (unit.startsWith("g")) return { g: Math.round(n) };
  if (unit === "ml") return { ml: Math.round(n) };
  if (unit === "cl") return { ml: Math.round(n * 10) };
  return { ml: Math.round(n * 1000) };
}

// ── Mapas ───────────────────────────────────────────────────────────────────────────────────

export const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

/** Propuesta inicial de opciones de la tienda (decisión W-4; el usuario puede añadir más). */
export const DEFAULT_OPTIONS: Record<string, string> = {
  talla: "Talla",
  color: "Color",
  estampado: "Color",
  sabor: "Sabor",
  menu: "Sabor",
  proteina: "Sabor",
  peso: "Tamaño",
  tamano: "Tamaño",
  modelo: "Modelo",
};

/** Opción para distinguir artículos agrupados que no tienen opciones propias. */
export const GROUP_OPTION = "Formato";

export type OptionMap = Map<string, string>; // fold(nombre Loyverse) → título en la tienda
export type CategoryMap = Map<string, string>; // fold(categoría Loyverse) → handles («a|b»)

// ── Conversión ──────────────────────────────────────────────────────────────────────────────

export type Selected = Record<string, string>; // fila de la hoja de revisión

export const PRODUCT_COLUMNS = [
  "handle",
  "titulo",
  "descripcion",
  "categorias",
  "iva",
  "estado",
  "sku",
  "ean",
  "precio",
  "stock",
  "neto_g",
  "neto_ml",
] as const;

export interface Warning {
  handle: string;
  articulo: string;
  sku: string;
  aviso: string;
}

export interface Converted {
  /** Columnas en orden: las de PRODUCT_COLUMNS con las `opcion:*` tras `ean`. */
  columns: string[];
  rows: Record<string, string>[];
  /** Handle por clave de producto (para `handles.csv`). */
  handles: { clave: string; titulo: string; handle: string }[];
  warnings: Warning[];
  /** Opciones de Loyverse sin entrada en el mapa (se para la conversión). */
  unmappedOptions: string[];
  /** Categorías de Loyverse sin entrada en el mapa. */
  unmappedCategories: string[];
}

const IVA: Record<string, string> = { "21": "general", "10": "reducido", "4": "superreducido" };

const price = (raw: string) => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n.toFixed(2).replace(".", ",") : "";
};

/** Primera letra en mayúscula (el importador avisa si un título empieza en minúscula). */
export const capitalize = (s: string) => (s ? s[0]!.toLocaleUpperCase("es") + s.slice(1) : s);

/**
 * Clave estable de un producto: el `nombre_nuevo` (agrupación) o el `item_id` de Loyverse. Con
 * ella `handles.csv` conserva el handle corregido por el usuario.
 */
export const productKey = (r: Selected) =>
  r.nombre_nuevo?.trim() ? `nombre:${fold(r.nombre_nuevo)}` : `item:${r.item_id}`;

export function convert(
  selected: Selected[],
  items: Map<string, Item>,
  maps: { options: OptionMap; categories: CategoryMap; handles: Map<string, string> },
  existingHandles: Set<string> = new Set(),
): Converted {
  const warnings: Warning[] = [];
  const unmappedOptions = new Set<string>();
  const unmappedCategories = new Set<string>();
  const warn = (handle: string, articulo: string, sku: string, aviso: string) =>
    warnings.push({ handle, articulo, sku, aviso });

  // Agrupar filas por producto, en el orden de la hoja.
  const groups = new Map<string, Selected[]>();
  for (const r of selected) {
    const key = productKey(r);
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  const taken = new Set(existingHandles);
  // Primero los handles fijados por el usuario (para que los propuestos no los pisen).
  for (const key of groups.keys()) {
    const h = maps.handles.get(key);
    if (h) taken.add(h);
  }

  const optionColumns: string[] = [];
  const rows: Record<string, string>[] = [];
  const handles: Converted["handles"] = [];

  for (const [key, list] of groups) {
    const first = list[0]!;
    const title = capitalize((first.nombre_nuevo?.trim() || first.articulo || "").trim());
    const fixed = maps.handles.get(key);
    let handle: string;
    if (fixed) {
      handle = fixed;
      if (!HANDLE_RE.test(fixed)) warn(fixed, title, "", "Handle no válido en handles.csv.");
    } else {
      handle = uniqueHandle(slugify(title), taken);
      if (handle !== slugify(title))
        warn(handle, title, "", "Handle repetido: se ha añadido un número.");
    }
    handles.push({ clave: key, titulo: title, handle });

    // Categorías: categoria_nueva (handles) o el mapa de la categoría de Loyverse.
    const cats = new Set<string>();
    for (const r of list) {
      const explicit = r.categoria_nueva?.trim();
      const mapped = explicit
        ? null
        : maps.categories.get(fold(r.categoria_loyverse || r.categoria || ""));
      const value = explicit || mapped || "";
      if (!value) {
        unmappedCategories.add(r.categoria_loyverse || r.categoria || "");
        continue;
      }
      for (const c of value
        .split("|")
        .map((x) => x.trim())
        .filter(Boolean))
        cats.add(c);
    }
    if (!cats.size) warn(handle, title, "", "Sin categoría.");

    // Opciones de cada variante (mapeadas) y, si se agrupan artículos, lo que los distingue.
    const multiItem = new Set(list.map((r) => r.item_id)).size > 1;
    const perRow = list.map((r) => {
      const item = items.get(r.item_id ?? "");
      const variant = item?.variants.find((v) => v.variant_id === r.variant_id);
      const values: Record<string, string> = {};
      for (const k of [1, 2, 3] as const) {
        const name = item?.[`option${k}_name`];
        const value = variant?.[`option${k}_value`];
        if (!name || !value) continue;
        const target = maps.options.get(fold(name));
        if (!target) {
          unmappedOptions.add(fold(name));
          continue;
        }
        if (values[target]) {
          warn(
            handle,
            title,
            r.sku ?? "",
            `Dos opciones de Loyverse van a «${target}»: se juntan.`,
          );
          values[target] = `${values[target]} ${value.trim()}`;
        } else values[target] = value.trim();
      }
      return { r, values };
    });
    const used = new Set(perRow.flatMap((x) => Object.keys(x.values)));
    if (multiItem) {
      // Si las opciones no distinguen todas las filas, se añade «Formato» = nombre del artículo.
      const combos = new Set(
        perRow.map((x) => [...used].map((o) => fold(x.values[o] ?? "")).join("|")),
      );
      if (combos.size < perRow.length || !used.size) {
        used.add(GROUP_OPTION);
        for (const x of perRow)
          x.values[GROUP_OPTION] = x.r.articulo_loyverse || x.r.articulo || "";
        warn(
          handle,
          title,
          "",
          `Agrupa ${new Set(list.map((r) => r.item_id)).size} artículos: revisa la opción «${GROUP_OPTION}».`,
        );
      } else {
        warn(handle, title, "", `Agrupa ${new Set(list.map((r) => r.item_id)).size} artículos.`);
      }
    }
    // Todas las variantes con valor en todas las opciones del producto.
    for (const x of perRow) {
      for (const o of used) {
        if (!x.values[o]) {
          x.values[o] = "Única";
          warn(handle, title, x.r.sku ?? "", `Sin valor en «${o}»: se pone «Única».`);
        }
      }
    }
    if (perRow.length > 1 && !used.size) {
      warn(handle, title, "", "Varias variantes sin opciones: revisa el artículo en Loyverse.");
    }
    const seen = new Map<string, string>();
    for (const x of perRow) {
      const combo = [...used]
        .sort()
        .map((o) => fold(x.values[o]!))
        .join("|");
      if (seen.has(combo)) {
        warn(
          handle,
          title,
          x.r.sku ?? "",
          `Combinación de opciones repetida con el SKU ${seen.get(combo)}.`,
        );
      } else seen.set(combo, x.r.sku ?? "");
    }
    for (const o of used) if (!optionColumns.includes(o)) optionColumns.push(o);

    // IVA del producto: el de la primera fila (todas deberían coincidir).
    const ivas = new Set(list.map((r) => r.iva));
    if (ivas.size > 1)
      warn(handle, title, "", `IVA distinto entre variantes (${[...ivas].join(", ")}).`);
    const iva = IVA[first.iva ?? ""];
    if (!iva)
      warn(handle, title, "", `IVA «${first.iva}» sin equivalencia: se deja vacío (general).`);

    perRow.forEach((x, i) => {
      const r = x.r;
      const row: Record<string, string> = {
        handle,
        titulo: i === 0 ? title : "",
        descripcion: "",
        categorias: i === 0 ? [...cats].join("|") : "",
        iva: i === 0 ? (iva ?? "") : "",
        estado: i === 0 ? "publicado" : "",
        sku: (r.sku ?? "").trim(),
        ean: (r.codigo_barras ?? "").trim(),
        precio: price(r.precio ?? ""),
        stock: "0",
        neto_g: "",
        neto_ml: "",
      };
      if (!row.sku) warn(handle, title, "", "Variante sin SKU.");
      if (!row.precio)
        warn(handle, title, row.sku ?? "", "Sin precio (precio variable o 0 en Loyverse).");
      const net =
        parseNet(Object.values(x.values).join(" ")) ??
        parseNet(r.articulo_loyverse || r.articulo || "");
      if (net && "g" in net) row.neto_g = String(net.g);
      if (net && "ml" in net) row.neto_ml = String(net.ml);
      for (const [o, v] of Object.entries(x.values)) row[`opcion:${o}`] = v;
      rows.push(row);
    });
  }

  const columns = [
    ...PRODUCT_COLUMNS.slice(0, PRODUCT_COLUMNS.indexOf("ean") + 1),
    ...optionColumns.map((o) => `opcion:${o}`),
    ...PRODUCT_COLUMNS.slice(PRODUCT_COLUMNS.indexOf("ean") + 1),
  ];
  return {
    columns,
    rows,
    handles,
    warnings,
    unmappedOptions: [...unmappedOptions].sort(),
    unmappedCategories: [...unmappedCategories].sort(),
  };
}

/**
 * Propuesta para las categorías de Loyverse de la tienda física frente al árbol nuevo
 * (`apps/backend/catalog/mi-carga/categorias.csv`). Es solo una propuesta: se revisa en
 * `mapa-categorias.csv`. Las que mezclan perro y gato (Higiene, Juguetes…) van a la de perro y se
 * corrigen por artículo con `categoria_nueva`.
 */
export const DEFAULT_CATEGORIES: Record<string, string> = {
  "accesorios humanos": "accesorios-para-ti",
  "arena gatos": "higiene-cuidados-gato",
  "arneses/collares": "paseo-perro",
  "bolsas papel": "paseo-perro",
  comederos: "comederos-perro",
  "comida barf": "barf-perro",
  "comida cocinada": "comida-cocinada-perro",
  "comida gatos": "alimentacion-gato",
  "comida humeda": "comida-humeda-perro",
  "comida deshidratada": "comida-cocinada-perro",
  complementos: "accesorios-perro",
  correas: "paseo-perro",
  descanso: "camas-sofas-perro",
  "estimulacion mental": "estimulacion-mental-perro",
  higiene: "higiene-cuidados-perro",
  juguetes: "mas-juguetes-perro",
  libros: "libros-para-ti",
  motivadores: "motivadores-perro",
  pienso: "piensos-perro",
  premios: "snacks-perro",
  ropa: "ropa-perro",
  "snacks/masticables": "snacks-perro",
  suplementos: "suplementos-perro",
};

/** Propuesta de mapa de categorías: tabla fija o, si no, el handle del árbol con nombre parecido. */
export function proposeCategory(
  loyverse: string,
  tree: { handle: string; nombre: string; padre: string }[],
): string {
  const fixed = DEFAULT_CATEGORIES[fold(loyverse)];
  if (fixed && tree.some((c) => c.handle === fixed)) return fixed;
  const words = fold(loyverse)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
  let best = { handle: "", score: 0 };
  for (const c of tree) {
    const hay = fold(`${c.nombre} ${c.handle}`);
    const score = words.filter((w) => hay.includes(w.replace(/s$/, ""))).length;
    // Mejor una hoja (categoría sin hijas) de perro, que es la mayoría del catálogo.
    const leaf = !tree.some((x) => x.padre === c.handle);
    const s = score * 10 + (leaf ? 2 : 0) + (c.handle.endsWith("-perro") ? 1 : 0);
    if (score && s > best.score) best = { handle: c.handle, score: s };
  }
  return best.handle;
}
