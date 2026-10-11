/**
 * Plan del importador de catálogo: cruza las hojas (`catalog-sheet.ts`) con lo que ya hay en
 * Medusa (instantánea leída por `import-catalog.ts`) y decide qué crear, qué actualizar y qué
 * dejar. Funciones puras (sin I/O) para poder testearlas.
 *
 * Reglas (docs/fases/faseC-catalogo.md §3):
 *   - Upsert por `handle` (categoría y producto) y por `sku` (variante). Lo que está en Medusa
 *     y no en la hoja se ignora.
 *   - Celda vacía = no tocar; `-` = borrar. Etiquetas y categorías: si la celda tiene valor,
 *     sustituye a las actuales.
 *   - Stock: solo al crear la variante.
 *   - Opciones globales (`is_exclusive: false`): se crean las que falten y sus valores.
 *     Los valores se comparan sin mayúsculas ni acentos y se usa la grafía que ya hay en Medusa.
 */
import {
  ANALYTIC_COLUMNS,
  ANALYTIC_PREFIX,
  fold,
  type CategorySheet,
  type Iva,
  type ProductSheet,
  type SheetIssue,
  type Status,
  type Text,
  type VariantSheet,
} from "./catalog-sheet";

export const CURRENCY = "eur";
export const SINGLE_VARIANT_TITLE = "Única";
/**
 * Medusa 2.21 exige al menos una opción por producto (el Admin crea «Default option»). Un
 * producto sin opciones en la hoja se crea con esta opción EXCLUSIVA (solo suya), como el
 * catálogo mock: «Formato: Única». El storefront oculta «Única» en carrito y pedidos.
 */
export const SINGLE_OPTION_TITLE = "Formato";

export interface DbCategory {
  id: string;
  handle: string;
  name: string;
  description: string | null;
  rank: number;
  is_active: boolean;
  parent_category_id: string | null;
}

export interface DbOption {
  id: string;
  title: string;
  values: { id: string; value: string }[];
}

export interface DbPrice {
  id: string;
  currency_code: string;
  amount: number;
  rules_count?: number | null;
}

export interface DbVariant {
  id: string;
  sku: string | null;
  ean: string | null;
  weight: number | null;
  length: number | null;
  width: number | null;
  height: number | null;
  /** Título de la opción → valor. */
  values: Record<string, string>;
  prices: DbPrice[];
  metadata: Record<string, unknown>;
  /** Unidades de inventario que gasta una unidad vendida (granel: gramos del paso). */
  requiredQuantity: number | null;
}

export interface DbProduct {
  id: string;
  handle: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  material: string | null;
  status: string;
  /** Valor del tipo de producto (`iva-reducido`…) o null. */
  type: string | null;
  collection: string | null;
  categories: string[];
  tags: string[];
  brand: string | null;
  metadata: Record<string, unknown>;
  options: DbOption[];
  variants: DbVariant[];
}

export interface CatalogSnapshot {
  categories: DbCategory[];
  collections: string[];
  tags: string[];
  /** Opciones globales. */
  options: DbOption[];
  /** Tipos de producto de IVA disponibles (valores). */
  types: string[];
  /** Productos de la hoja que ya existen. */
  products: DbProduct[];
  /** SKU y EAN de la hoja que ya usa alguna variante → handle de su producto. */
  skuOwners: Record<string, string>;
  eanOwners: Record<string, { sku: string | null; handle: string }>;
}

export const IVA_TYPE: Record<Iva, string | null> = {
  general: null,
  reducido: "iva-reducido",
  superreducido: "iva-superreducido",
};
export const BRAND_KEY = "marca";
/** Claves de metadata (contrato con el storefront; ver LEEME.md). */
export const META = {
  bulk: "granel",
  stepG: "paso_g",
  minG: "min_g",
  netG: "neto_g",
  netMl: "neto_ml",
} as const;
export const GRAMS = "g";

export interface CategoryUpdate {
  sheet: CategorySheet;
  id: string;
  changes: string[];
}

export interface VariantUpdate {
  sheet: VariantSheet;
  db: DbVariant;
  changes: string[];
}

export interface ProductUpdate {
  sheet: ProductSheet;
  db: DbProduct;
  changes: string[];
  newVariants: VariantSheet[];
  variants: VariantUpdate[];
  /**
   * Valores que hay que enlazar al producto antes de crear/cambiar variantes (Medusa ≥ 2.16:
   * cada producto tiene su subconjunto de valores de una opción global).
   */
  linkValues: { optionId: string; values: string[] }[];
}

export interface CatalogPlan {
  errors: SheetIssue[];
  warnings: SheetIssue[];
  categories: { create: CategorySheet[]; update: CategoryUpdate[]; unchanged: number };
  options: {
    create: { title: string; values: string[] }[];
    addValues: { id: string; title: string; values: string[] }[];
  };
  tags: string[];
  products: { create: ProductSheet[]; update: ProductUpdate[]; unchanged: number };
}

const textChanged = (sheet: Text, db: string | null | undefined) =>
  sheet !== undefined && (sheet ?? "") !== (db ?? "");
const numChanged = (sheet: number | null | undefined, db: number | null | undefined) =>
  sheet !== undefined && (sheet ?? null) !== (db ?? null);
const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join("\u0000") === [...b].sort().join("\u0000");

/** Precio base EUR (sin reglas) de una variante. */
export const basePrice = (v: DbVariant) =>
  v.prices.find((p) => p.currency_code === CURRENCY && !p.rules_count);

export const variantTitle = (options: string[], values: Record<string, string>) =>
  options.length ? options.map((t) => values[t]).join(" / ") : SINGLE_VARIANT_TITLE;

/** Busca por título/valor sin mayúsculas ni acentos. */
export const findByFold = <T>(items: T[], key: (t: T) => string, wanted: string) =>
  items.find((i) => fold(key(i)) === fold(wanted));

const issue = (
  file: string,
  line: number,
  column: string | undefined,
  message: string,
): SheetIssue => ({ file, line, ...(column ? { column } : {}), message });

export function planCatalog(
  sheets: { categories: CategorySheet[]; products: ProductSheet[] },
  db: CatalogSnapshot,
  files = { categories: "categorias.csv", products: "productos.csv" },
): CatalogPlan {
  const errors: SheetIssue[] = [];
  const warnings: SheetIssue[] = [];
  const plan: CatalogPlan = {
    errors,
    warnings,
    categories: { create: [], update: [], unchanged: 0 },
    options: { create: [], addValues: [] },
    tags: [],
    products: { create: [], update: [], unchanged: 0 },
  };

  // ── Categorías ───────────────────────────────────────────────────────────
  const dbCat = new Map(db.categories.map((c) => [c.handle, c]));
  const dbCatById = new Map(db.categories.map((c) => [c.id, c]));
  const sheetCat = new Map(sheets.categories.map((c) => [c.handle, c]));
  const knownCategory = (h: string) => dbCat.has(h) || sheetCat.has(h);
  /** Padre final de una categoría (hoja si lo indica; si no, el de Medusa). */
  const parentOf = (h: string): string | null => {
    const s = sheetCat.get(h);
    if (s && s.parent !== undefined) return s.parent;
    const d = dbCat.get(h);
    return d?.parent_category_id ? (dbCatById.get(d.parent_category_id)?.handle ?? null) : null;
  };

  /** Handles cuyo nombre coincide (sin mayúsculas ni tildes) con lo escrito. */
  const suggest = (written: string) => {
    const names = [
      ...sheets.categories.map((c) => ({ handle: c.handle, name: c.name ?? "" })),
      ...db.categories.filter((c) => !sheetCat.has(c.handle)),
    ];
    const hits = names.filter((c) => fold(c.name) === fold(written)).map((c) => c.handle);
    return hits.length
      ? ` ¿Querías decir ${hits.map((h) => `«${h}»`).join(" o ")}? (va el handle, no el nombre)`
      : "";
  };
  for (const cat of sheets.categories) {
    const existing = dbCat.get(cat.handle);
    if (cat.parent && !knownCategory(cat.parent)) {
      errors.push(
        issue(
          files.categories,
          cat.line,
          "padre",
          `No existe la categoría «${cat.parent}».${suggest(cat.parent)}`,
        ),
      );
      continue;
    }
    // Ciclos al combinar la hoja con Medusa (mover una categoría bajo una hija suya)
    const path = new Set([cat.handle]);
    let cycle = false;
    for (let p = parentOf(cat.handle); p; p = parentOf(p)) {
      if (path.has(p)) {
        cycle = true;
        break;
      }
      path.add(p);
    }
    if (cycle) {
      errors.push(
        issue(files.categories, cat.line, "padre", "Ciclo de categorías (con las de Medusa)."),
      );
      continue;
    }
    if (!existing) {
      if (!cat.name) {
        errors.push(issue(files.categories, cat.line, "nombre", "Falta el nombre."));
        continue;
      }
      plan.categories.create.push(cat);
      continue;
    }
    const changes: string[] = [];
    if (cat.name && cat.name !== existing.name) changes.push("nombre");
    if (cat.parent !== undefined) {
      const current = existing.parent_category_id
        ? (dbCatById.get(existing.parent_category_id)?.handle ?? null)
        : null;
      if ((cat.parent ?? null) !== current) changes.push("padre");
    }
    if (textChanged(cat.description, existing.description)) changes.push("descripción");
    if (cat.rank !== undefined && cat.rank !== existing.rank) changes.push("orden");
    if (cat.active !== undefined && cat.active !== existing.is_active) changes.push("activa");
    if (changes.length) plan.categories.update.push({ sheet: cat, id: existing.id, changes });
    else plan.categories.unchanged += 1;
  }

  // ── Opciones globales y etiquetas (todo lo que pida la hoja) ─────────────
  const newOptions = new Map<string, { title: string; values: string[] }>();
  const newValues = new Map<string, { id: string; title: string; values: string[] }>();
  const dbProduct = new Map(db.products.map((p) => [p.handle, p]));

  const wantValue = (title: string, value: string) => {
    const global = findByFold(db.options, (o) => o.title, title);
    if (!global) {
      const key = fold(title);
      const entry = newOptions.get(key) ?? { title, values: [] };
      if (!findByFold(entry.values, (v) => v, value)) entry.values.push(value);
      newOptions.set(key, entry);
      return;
    }
    if (findByFold(global.values, (v) => v.value, value)) return;
    const entry = newValues.get(global.id) ?? { id: global.id, title: global.title, values: [] };
    if (!findByFold(entry.values, (v) => v, value)) entry.values.push(value);
    newValues.set(global.id, entry);
  };

  const newTags = new Map<string, string>();
  for (const p of sheets.products) {
    for (const t of p.tags ?? []) {
      if (!findByFold(db.tags, (x) => x, t) && !newTags.has(fold(t))) newTags.set(fold(t), t);
    }
  }
  plan.tags = [...newTags.values()];

  // ── Productos ────────────────────────────────────────────────────────────
  for (const p of sheets.products) {
    const e = (line: number, column: string | undefined, message: string) =>
      errors.push(issue(files.products, line, column, message));
    const before = errors.length;
    const existing = dbProduct.get(p.handle);

    for (const c of p.categories ?? []) {
      if (!knownCategory(c)) {
        e(p.line, "categorias", `No existe la categoría «${c}».${suggest(c)}`);
      }
    }
    if (p.collection && !db.collections.includes(p.collection)) {
      e(p.line, "coleccion", `No existe la colección «${p.collection}» (créala en el Admin).`);
    }
    const ivaType = p.iva ? IVA_TYPE[p.iva] : null;
    if (ivaType && !db.types.includes(ivaType)) {
      e(p.line, "iva", `Falta el tipo de producto «${ivaType}» (ejecuta el seed).`);
    }
    for (const v of p.variants) {
      const owner = db.skuOwners[v.sku];
      if (owner && owner !== p.handle) {
        e(v.line, "sku", `El SKU ya es de otro producto («${owner}»).`);
      }
      const eanOwner = v.ean ? db.eanOwners[v.ean] : undefined;
      if (eanOwner && eanOwner.sku !== v.sku) {
        e(
          v.line,
          "ean",
          `El EAN ya lo usa otra variante (${eanOwner.sku ?? "sin SKU"} de «${eanOwner.handle}»).`,
        );
      }
    }

    if (!existing) {
      if (!p.title) e(p.line, "titulo", "Falta el título (obligatorio al crear el producto).");
      if (errors.length > before) continue;
      p.variants.forEach((v) => Object.entries(v.values).forEach(([t, val]) => wantValue(t, val)));
      plan.products.create.push(p);
      continue;
    }

    // Producto existente: las opciones deben ser las mismas que ya tiene. Sin opciones en la
    // hoja = la opción única «Formato: Única» (o cualquier opción con solo «Única»).
    const optionOf = (title: string) => findByFold(existing.options, (o) => o.title, title);
    const implicit = isSingleOption(p, existing);
    const valuesOf = (v: VariantSheet) => (implicit ? implicitValues(existing) : v.values);
    const sheetTitles = (implicit ? existing.options.map((o) => o.title) : p.options)
      .map(fold)
      .sort();
    const dbTitles = existing.options.map((o) => fold(o.title)).sort();
    if (sheetTitles.join("|") !== dbTitles.join("|")) {
      e(
        p.line,
        "opciones",
        `Las opciones no coinciden con las del producto en Medusa (${existing.options.map((o) => o.title).join(", ") || "ninguna"}). ` +
          "Cambiar las opciones de un producto ya creado se hace en el Admin.",
      );
      continue;
    }
    /** Valores de la hoja con la grafía de Medusa (título de la opción del producto). */
    const resolve = (values: Record<string, string>) =>
      Object.fromEntries(
        Object.entries(values).map(([t, val]) => {
          const option = optionOf(t) as DbOption;
          const global = db.options.find((o) => o.id === option.id);
          const known =
            findByFold(option.values, (x) => x.value, val) ??
            findByFold(global?.values ?? [], (x) => x.value, val);
          return [option.title, known?.value ?? val];
        }),
      );
    const comboKey = (values: Record<string, string>) =>
      existing.options.map((o) => fold(values[o.title] ?? "")).join("\u0000");
    const bySku = new Map(existing.variants.map((v) => [v.sku, v]));
    const sheetSkus = new Set(p.variants.map((v) => v.sku));

    const changes: string[] = [];
    if (p.title && p.title !== existing.title) changes.push("título");
    if (textChanged(p.subtitle, existing.subtitle)) changes.push("subtítulo");
    if (textChanged(p.description, existing.description)) changes.push("descripción");
    if (textChanged(p.material, existing.material)) changes.push("material");
    if (textChanged(p.brand, existing.brand)) changes.push("marca");
    if (
      Object.keys(productMetadata(p)).some((k) =>
        metaChanged(productMetadata(p)[k], existing.metadata[k]),
      )
    ) {
      changes.push("analíticos");
    }
    if (p.status && p.status !== existing.status) changes.push("estado");
    if (p.iva && IVA_TYPE[p.iva] !== existing.type) changes.push("iva");
    if (p.collection !== undefined && (p.collection ?? null) !== existing.collection) {
      changes.push("colección");
    }
    if (p.categories !== undefined && !sameSet(p.categories ?? [], existing.categories)) {
      changes.push("categorías");
    }
    if (p.tags !== undefined) {
      const wanted = (p.tags ?? []).map(
        (t) => findByFold(db.tags, (x) => x, t) ?? newTags.get(fold(t)) ?? t,
      );
      if (!sameSet(wanted, existing.tags)) changes.push("etiquetas");
    }

    const newVariants: VariantSheet[] = [];
    const variants: VariantUpdate[] = [];
    const link = new Map<string, Set<string>>();
    for (const v of p.variants) {
      const dbv = bySku.get(v.sku);
      if (implicit && !dbv) {
        e(
          v.line,
          "sku",
          "Producto sin opciones: su variante ya existe con otro SKU (cámbialo en el Admin).",
        );
        continue;
      }
      const values = resolve(valuesOf(v));
      // Combinación ya usada por otra variante de Medusa que no está en la hoja con ese SKU
      const clash = existing.variants.find(
        (o) =>
          o.sku !== v.sku && comboKey(o.values) === comboKey(values) && !sheetSkus.has(o.sku ?? ""),
      );
      if (clash) {
        e(v.line, "opciones", `Esa combinación ya es de la variante ${clash.sku ?? clash.id}.`);
        continue;
      }
      Object.entries(valuesOf(v)).forEach(([t, val]) => {
        const option = optionOf(t) as DbOption;
        if (db.options.some((o) => o.id === option.id)) wantValue(option.title, val);
      });
      const needsLink = () => {
        for (const [t, val] of Object.entries(values)) {
          const option = optionOf(t) as DbOption;
          if (findByFold(option.values, (x) => x.value, val)) continue;
          link.set(option.id, (link.get(option.id) ?? new Set()).add(val));
        }
      };
      if (!dbv) {
        needsLink();
        newVariants.push(v);
        continue;
      }
      const dbStep = dbv.metadata[META.stepG];
      if (v.bulk && dbStep !== v.bulk.stepG) {
        e(
          v.line,
          "paso_g",
          typeof dbStep === "number"
            ? `El paso ya es de ${dbStep} g: cambiarlo movería el stock y los precios (hazlo en el Admin o crea otra variante).`
            : "La variante ya existe y no es a granel: no se puede convertir (crea otra variante con otro SKU).",
        );
        continue;
      }
      if (!v.bulk && typeof dbStep === "number") {
        e(v.line, "granel", "La variante ya existe a granel: no se puede convertir desde la hoja.");
        continue;
      }
      const vc: string[] = [];
      if (comboKey(values) !== comboKey(dbv.values)) {
        needsLink();
        vc.push("opciones");
      }
      if (textChanged(v.ean, dbv.ean)) vc.push("ean");
      if (basePrice(dbv)?.amount !== v.price) vc.push("precio");
      if (numChanged(v.weight, dbv.weight)) vc.push("peso");
      if (numChanged(v.length, dbv.length)) vc.push("largo");
      if (numChanged(v.width, dbv.width)) vc.push("ancho");
      if (numChanged(v.height, dbv.height)) vc.push("alto");
      const vm = variantMetadata(v);
      if (Object.keys(vm).some((k) => metaChanged(vm[k], dbv.metadata[k]))) vc.push("neto/granel");
      if (vc.length) variants.push({ sheet: v, db: dbv, changes: vc });
    }
    if (errors.length > before) continue;
    if (changes.length || newVariants.length || variants.length) {
      const linkValues = [...link].map(([optionId, vals]) => ({ optionId, values: [...vals] }));
      plan.products.update.push({
        sheet: p,
        db: existing,
        changes,
        newVariants,
        variants,
        linkValues,
      });
    } else {
      plan.products.unchanged += 1;
    }
  }

  plan.options.create = [...newOptions.values()];
  plan.options.addValues = [...newValues.values()];
  return plan;
}

/** Valor de metadata de la hoja frente al de Medusa ("" = borrar la clave). */
const metaChanged = (sheet: unknown, db: unknown) =>
  sheet === "" ? db !== undefined && db !== null : sheet !== db;

/** Metadata del producto que escribe la hoja: analíticos, extras y granel ("" = borrar). */
export function productMetadata(p: ProductSheet): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  for (const c of ANALYTIC_COLUMNS) {
    const v = p.analytics[c];
    if (v !== undefined) meta[c] = v ?? "";
  }
  for (const [title, v] of Object.entries(p.extraAnalytics)) {
    meta[`${ANALYTIC_PREFIX}${title}`] = v ?? "";
  }
  if (p.bulk !== undefined) meta[META.bulk] = p.bulk ? true : "";
  if (p.brand !== undefined) meta[BRAND_KEY] = p.brand ?? "";
  return meta;
}

/** Metadata de la variante: contenido neto y granel ("" = borrar). */
export function variantMetadata(v: VariantSheet): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  if (v.netG !== undefined) meta[META.netG] = v.netG ?? "";
  if (v.netMl !== undefined) meta[META.netMl] = v.netMl ?? "";
  if (v.bulk) {
    meta[META.stepG] = v.bulk.stepG;
    meta[META.minG] = v.bulk.minG;
  }
  return meta;
}

/** ¿Producto sin opciones en la hoja que en Medusa tiene una sola opción con solo «Única»? */
export function isSingleOption(p: ProductSheet, product: DbProduct) {
  const [only, ...rest] = product.options;
  return (
    !p.options.length &&
    !!only &&
    !rest.length &&
    only.values.length > 0 &&
    only.values.every((v) => v.value === SINGLE_VARIANT_TITLE)
  );
}

const implicitValues = (product: DbProduct) =>
  Object.fromEntries(product.options.map((o) => [o.title, SINGLE_VARIANT_TITLE]));

// ── Construcción de las entradas de los workflows (con ids ya resueltos) ───

export interface CatalogRefs {
  categoryId: (handle: string) => string;
  collectionId: (handle: string) => string;
  tagId: (value: string) => string;
  /** id del tipo de producto de IVA (`null` = general). */
  typeId: (iva: Iva) => string | null;
  /** Opción global por título (sin mayúsculas ni acentos). */
  option: (title: string) => DbOption;
  salesChannelId: string;
  shippingProfileId: string;
}

const STATUS_DEFAULT: Status = "published";

/** Valores con la grafía de la opción global. */
export function globalValues(values: Record<string, string>, refs: CatalogRefs) {
  return Object.fromEntries(
    Object.entries(values).map(([t, val]) => {
      const option = refs.option(t);
      const known = findByFold(option.values, (x) => x.value, val);
      if (!known) throw new Error(`Falta el valor «${val}» en la opción «${option.title}»`);
      return [option.title, known.value];
    }),
  );
}

const measures = (v: VariantSheet) => ({
  ...(v.weight !== undefined ? { weight: v.weight } : {}),
  ...(v.length !== undefined ? { length: v.length } : {}),
  ...(v.width !== undefined ? { width: v.width } : {}),
  ...(v.height !== undefined ? { height: v.height } : {}),
});

/** Metadata al crear (sin las claves a borrar). */
const createMetadata = (meta: Record<string, unknown>) => {
  const clean = Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== ""));
  return Object.keys(clean).length ? { metadata: clean } : {};
};

/**
 * Granel: la variante gasta `paso_g` unidades (gramos) de su artículo de inventario por cada
 * unidad vendida (inventory kit, `required_quantity`). El artículo en gramos lo crea antes el
 * script (`inventoryItemId`: SKU → id).
 */
const bulkInventory = (v: VariantSheet, inventoryItemId?: (sku: string) => string) =>
  v.bulk && inventoryItemId
    ? {
        inventory_items: [
          { inventory_item_id: inventoryItemId(v.sku), required_quantity: v.bulk.stepG },
        ],
      }
    : {};

const productFields = (p: ProductSheet, refs: CatalogRefs) => ({
  ...(p.title ? { title: p.title } : {}),
  ...(p.subtitle !== undefined ? { subtitle: p.subtitle } : {}),
  ...(p.description !== undefined ? { description: p.description } : {}),
  ...(p.material !== undefined ? { material: p.material } : {}),
  ...(p.status ? { status: p.status } : {}),
  ...(p.iva ? { type_id: refs.typeId(p.iva) } : {}),
  ...(p.collection !== undefined
    ? { collection_id: p.collection ? refs.collectionId(p.collection) : null }
    : {}),
  ...(p.categories !== undefined
    ? { category_ids: (p.categories ?? []).map(refs.categoryId) }
    : {}),
  ...(p.tags !== undefined ? { tag_ids: (p.tags ?? []).map(refs.tagId) } : {}),
  // Medusa fusiona metadata; "" borra la clave
  ...(Object.keys(productMetadata(p)).length ? { metadata: productMetadata(p) } : {}),
});

/** Entrada de `createProductsWorkflow` para un producto nuevo. */
export function productCreateInput(
  p: ProductSheet,
  refs: CatalogRefs,
  inventoryItemId?: (sku: string) => string,
) {
  if (!p.options.length) {
    const [v] = p.variants;
    if (!v || p.variants.length > 1) throw new Error(`${p.handle}: sin opciones y varias filas`);
    return {
      ...productFields(p, refs),
      title: p.title as string,
      handle: p.handle,
      status: p.status ?? STATUS_DEFAULT,
      shipping_profile_id: refs.shippingProfileId,
      sales_channels: [{ id: refs.salesChannelId }],
      options: [{ title: SINGLE_OPTION_TITLE, values: [SINGLE_VARIANT_TITLE] }],
      variants: [
        {
          title: SINGLE_VARIANT_TITLE,
          sku: v.sku,
          ...(v.ean ? { ean: v.ean } : {}),
          ...measures(v),
          ...createMetadata(variantMetadata(v)),
          ...bulkInventory(v, inventoryItemId),
          options: { [SINGLE_OPTION_TITLE]: SINGLE_VARIANT_TITLE },
          manage_inventory: true,
          prices: [{ currency_code: CURRENCY, amount: v.price }],
        },
      ],
    };
  }
  const options = p.options.map((t) => refs.option(t));
  const resolved = p.variants.map((v) => globalValues(v.values, refs));
  return {
    ...productFields(p, refs),
    title: p.title as string,
    handle: p.handle,
    status: p.status ?? STATUS_DEFAULT,
    shipping_profile_id: refs.shippingProfileId,
    sales_channels: [{ id: refs.salesChannelId }],
    options: options.map((o) => {
      const used = new Set(resolved.map((values) => values[o.title]));
      return { id: o.id, value_ids: o.values.filter((x) => used.has(x.value)).map((x) => x.id) };
    }),
    variants: p.variants.map((v, i) => {
      const values = resolved[i] as Record<string, string>;
      return {
        title: variantTitle(
          options.map((o) => o.title),
          values,
        ),
        sku: v.sku,
        ...(v.ean ? { ean: v.ean } : {}),
        ...measures(v),
        ...createMetadata(variantMetadata(v)),
        ...bulkInventory(v, inventoryItemId),
        options: values,
        manage_inventory: true,
        prices: [{ currency_code: CURRENCY, amount: v.price }],
      };
    }),
  };
}

/** Entrada de `updateProductsWorkflow` (solo los datos del producto, sin variantes). */
export function productUpdateInput(u: ProductUpdate, refs: CatalogRefs) {
  return { id: u.db.id, ...productFields(u.sheet, refs) };
}

/** Valores de la hoja con la grafía de las opciones del producto existente. */
export function productValues(values: Record<string, string>, product: DbProduct) {
  return Object.fromEntries(
    Object.entries(values).map(([t, val]) => {
      const option = findByFold(product.options, (o) => o.title, t) as DbOption;
      const known = findByFold(option.values, (x) => x.value, val);
      return [option.title, known?.value ?? val];
    }),
  );
}

/** Variante nueva de un producto existente (`batchProductVariantsWorkflow.create`). */
export function variantCreateInput(
  v: VariantSheet,
  product: DbProduct,
  inventoryItemId?: (sku: string) => string,
) {
  const values = productValues(v.values, product);
  return {
    product_id: product.id,
    title: variantTitle(
      product.options.map((o) => o.title),
      values,
    ),
    sku: v.sku,
    ...(v.ean ? { ean: v.ean } : {}),
    ...measures(v),
    ...createMetadata(variantMetadata(v)),
    ...bulkInventory(v, inventoryItemId),
    options: values,
    manage_inventory: true,
    prices: [{ currency_code: CURRENCY, amount: v.price }],
  };
}

/**
 * Variante existente (`batchProductVariantsWorkflow.update`). Al pasar `prices`, Medusa borra
 * los que no se mencionan: se mandan todos los actuales con su `id` y solo cambia el EUR base.
 */
export function variantUpdateInput(u: VariantUpdate, product: DbProduct) {
  const values = productValues(
    Object.keys(u.sheet.values).length ? u.sheet.values : implicitValues(product),
    product,
  );
  const base = basePrice(u.db);
  return {
    id: u.db.id,
    ...(u.changes.includes("opciones")
      ? {
          options: values,
          title: variantTitle(
            product.options.map((o) => o.title),
            values,
          ),
        }
      : {}),
    ...(u.changes.includes("ean") ? { ean: u.sheet.ean ?? null } : {}),
    ...measures(u.sheet),
    ...(u.changes.includes("neto/granel") ? { metadata: variantMetadata(u.sheet) } : {}),
    ...(u.changes.includes("precio")
      ? {
          prices: [
            ...u.db.prices
              .filter((p) => p.id !== base?.id)
              .map((p) => ({ id: p.id, currency_code: p.currency_code, amount: p.amount })),
            base
              ? { id: base.id, currency_code: CURRENCY, amount: u.sheet.price }
              : { currency_code: CURRENCY, amount: u.sheet.price },
          ],
        }
      : {}),
  };
}

// ── Ofertas (Price List `sale` propia del importador) ──────────────────────

export interface SalePlan {
  create: { variant_id: string; amount: number }[];
  update: { id: string; variant_id: string; amount: number }[];
  delete: string[];
}

/**
 * Compara las ofertas de la hoja con los precios de la lista. `wanted`: SKU → precio de oferta
 * (null = sin oferta); solo los SKU cuya hoja trae la columna `precio_oferta`.
 */
export function planSale(
  wanted: Map<string, number | null>,
  variants: { id: string; sku: string; price_set_id: string }[],
  listPrices: { id: string; price_set_id: string; amount: number; currency_code: string }[],
): SalePlan {
  const plan: SalePlan = { create: [], update: [], delete: [] };
  const bySet = new Map<string, typeof listPrices>();
  for (const p of listPrices) {
    if (p.currency_code !== CURRENCY) continue;
    bySet.set(p.price_set_id, [...(bySet.get(p.price_set_id) ?? []), p]);
  }
  for (const v of variants) {
    if (!wanted.has(v.sku)) continue;
    const amount = wanted.get(v.sku) ?? null;
    const [current, ...extra] = bySet.get(v.price_set_id) ?? [];
    plan.delete.push(...extra.map((p) => p.id));
    if (amount === null) {
      if (current) plan.delete.push(current.id);
    } else if (!current) {
      plan.create.push({ variant_id: v.id, amount });
    } else if (current.amount !== amount) {
      plan.update.push({ id: current.id, variant_id: v.id, amount });
    }
  }
  return plan;
}
