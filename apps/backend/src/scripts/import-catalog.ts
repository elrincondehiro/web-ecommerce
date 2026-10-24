/**
 * Importador de catálogo (categorías + productos con variantes) desde CSV.
 *
 *   pnpm --filter backend catalog:import <carpeta> [dry-run]
 *
 * - `<carpeta>` con `categorias.csv` y/o `productos.csv` (formato y ejemplo en
 *   `apps/backend/catalog/plantilla/`). Ruta relativa a apps/backend (o absoluta).
 * - Valida TODO antes de escribir: si hay un solo error, no cambia nada (informe por fila).
 * - Orden: categorías (padres antes que hijas) → opciones globales, valores y etiquetas →
 *   productos nuevos (+ stock) → productos existentes (datos y variantes) → ofertas.
 * - Idempotente: upsert por `handle` / `sku`; volver a cargar la misma hoja no cambia nada.
 *   Lo que está en Medusa y no en la hoja se ignora. El stock solo se fija al crear la variante.
 * - Solo workflows oficiales de Medusa (el índice de búsqueda se actualiza solo).
 * - `dry-run`: solo informa.
 * - Fotos: aparte, con `images:import <carpeta>` (`handle_01.jpg`…).
 *
 * Fuentes: context7 /medusajs/medusa (createProductsWorkflow, batchVariants: «los precios sin
 * mencionar se borran», price lists `sale`) y tipos/código de @medusajs/core-flows 2.21.2
 * (create/updateProductCategoriesWorkflow, create/updateProductOptionsWorkflow,
 * setProductProductOptionsWorkflow, batchProductVariantsWorkflow, batchPriceListPricesWorkflow).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ExecArgs, MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules, PriceListStatus } from "@medusajs/framework/utils";
import {
  batchPriceListPricesWorkflow,
  batchProductVariantsWorkflow,
  createInventoryItemsWorkflow,
  createInventoryLevelsWorkflow,
  createPriceListsWorkflow,
  createProductCategoriesWorkflow,
  createProductOptionsWorkflow,
  createProductsWorkflow,
  createProductTagsWorkflow,
  setProductProductOptionsWorkflow,
  updateProductCategoriesWorkflow,
  updateProductOptionsWorkflow,
  updateProductsWorkflow,
} from "@medusajs/medusa/core-flows";
import { SALES_CHANNEL_NAME } from "./seed";
import { decodeUtf8, parseCsv } from "./lib/csv";
import {
  CATEGORIES_FILE,
  PRODUCTS_FILE,
  readCategories,
  readProducts,
  type CategorySheet,
  type ProductSheet,
  type SheetIssue,
} from "./lib/catalog-sheet";
import {
  BRAND_KEY,
  CURRENCY,
  GRAMS,
  IVA_TYPE,
  findByFold,
  planCatalog,
  planSale,
  productCreateInput,
  productUpdateInput,
  variantCreateInput,
  variantUpdateInput,
  type CatalogPlan,
  type CatalogRefs,
  type CatalogSnapshot,
  type DbOption,
  type DbProduct,
} from "./lib/catalog-plan";
import { clearMedusaCache } from "./lib/clear-cache";

export const SALE_LIST_TITLE = "Catálogo — ofertas";
const PRODUCT_BATCH = 20;
const UPDATE_CONCURRENCY = 4;
const CHUNK = 200;
const MAX_REPORT = 200;

const chunks = <T>(items: T[], size = CHUNK) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, i * size + size),
  );

const formatIssue = (i: SheetIssue) =>
  `${i.file}:${i.line}${i.column ? ` [${i.column}]` : ""} ${i.message}`;

async function readSheet(dir: string, file: string) {
  try {
    return decodeUtf8(await readFile(path.join(dir, file)));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    // target ES2021: el constructor de Error no admite `cause`; se asigna aparte
    throw Object.assign(new Error(`${file}: ${(e as Error).message}`), { cause: e });
  }
}

// ── Lectura de lo que hay en Medusa ─────────────────────────────────────────

type Row = Record<string, unknown>;

async function loadSnapshot(
  container: MedusaContainer,
  products: ProductSheet[],
): Promise<CatalogSnapshot> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const productModule = container.resolve(Modules.PRODUCT);

  const categories = await productModule.listProductCategories(
    {},
    {
      select: ["id", "handle", "name", "description", "rank", "is_active", "parent_category_id"],
      take: null,
    },
  );
  const collections = await productModule.listProductCollections(
    {},
    { select: ["handle"], take: null },
  );
  const tags = await productModule.listProductTags({}, { select: ["value"], take: null });
  const options = await productModule.listProductOptions(
    { is_exclusive: false },
    { relations: ["values"], take: null },
  );
  const types = await productModule.listProductTypes({}, { select: ["value"], take: null });

  const dbProducts: DbProduct[] = [];
  for (const handles of chunks(products.map((p) => p.handle))) {
    const { data } = await query.graph({
      entity: "product",
      fields: [
        "id",
        "handle",
        "title",
        "subtitle",
        "description",
        "material",
        "status",
        "metadata",
        "type.value",
        "collection.handle",
        "categories.handle",
        "tags.value",
        "options.id",
        "options.title",
        "options.values.id",
        "options.values.value",
        "variants.id",
        "variants.sku",
        "variants.ean",
        "variants.weight",
        "variants.length",
        "variants.width",
        "variants.height",
        "variants.metadata",
        "variants.inventory_items.required_quantity",
        "variants.options.value",
        "variants.options.option_id",
        "variants.prices.id",
        "variants.prices.currency_code",
        "variants.prices.amount",
        "variants.prices.rules_count",
      ],
      filters: { handle: handles },
    });
    for (const p of data as Row[]) dbProducts.push(toDbProduct(p));
  }

  // Sustitutos (Fase E) y relacionados (Fase R) que no están en la hoja
  const sheetHandles = new Set(products.map((p) => p.handle));
  const wanted = [
    ...new Set(
      products.flatMap((p) => [...(p.replacement ? [p.replacement] : []), ...(p.related ?? [])]),
    ),
  ].filter((h) => !sheetHandles.has(h));
  const replacementHandles: string[] = [];
  for (const part of chunks(wanted)) {
    const { data } = await query.graph({
      entity: "product",
      fields: ["handle"],
      filters: { handle: part },
    });
    for (const p of data as Row[]) replacementHandles.push(p.handle as string);
  }

  const skuOwners: Record<string, string> = {};
  const eanOwners: CatalogSnapshot["eanOwners"] = {};
  const skus = products.flatMap((p) => p.variants.map((v) => v.sku));
  const eans = products.flatMap((p) => p.variants.flatMap((v) => (v.ean ? [v.ean] : [])));
  for (const [key, values] of [
    ["sku", skus],
    ["ean", eans],
  ] as const) {
    for (const part of chunks(values)) {
      const { data } = await query.graph({
        entity: "product_variant",
        fields: ["sku", "ean", "product.handle"],
        filters: { [key]: part },
      });
      for (const v of data as Row[]) {
        const handle = (v.product as Row | undefined)?.handle as string;
        if (key === "sku" && v.sku) skuOwners[v.sku as string] = handle;
        if (key === "ean" && v.ean) {
          eanOwners[v.ean as string] = { sku: (v.sku as string) ?? null, handle };
        }
      }
    }
  }

  return {
    categories: categories.map((c) => ({
      id: c.id,
      handle: c.handle,
      name: c.name,
      description: c.description || null,
      rank: Number(c.rank ?? 0),
      is_active: Boolean(c.is_active),
      parent_category_id: c.parent_category_id ?? null,
    })),
    collections: collections.map((c) => c.handle),
    tags: tags.map((t) => t.value),
    options: options.map(toDbOption),
    types: types.map((t) => t.value),
    products: dbProducts,
    replacementHandles,
    skuOwners,
    eanOwners,
  };
}

function toDbOption(o: {
  id: string;
  title: string;
  values?: ({ id: string; value: string } | null)[] | null;
}): DbOption {
  return {
    id: o.id,
    title: o.title,
    values: (o.values ?? []).flatMap((v) => (v ? [{ id: v.id, value: v.value }] : [])),
  };
}

function toDbProduct(p: Row): DbProduct {
  const options = ((p.options as Row[] | null) ?? []).map((o) =>
    toDbOption(o as Parameters<typeof toDbOption>[0]),
  );
  const optionTitle = new Map(options.map((o) => [o.id, o.title]));
  const metadata = (p.metadata as Record<string, unknown> | null) ?? {};
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    id: p.id as string,
    handle: p.handle as string,
    title: p.title as string,
    subtitle: (p.subtitle as string | null) ?? null,
    description: (p.description as string | null) ?? null,
    material: (p.material as string | null) ?? null,
    status: p.status as string,
    type: ((p.type as Row | null)?.value as string | undefined) ?? null,
    collection: ((p.collection as Row | null)?.handle as string | undefined) ?? null,
    categories: ((p.categories as Row[] | null) ?? []).map((c) => c.handle as string),
    tags: ((p.tags as Row[] | null) ?? []).map((t) => t.value as string),
    brand: typeof metadata[BRAND_KEY] === "string" ? (metadata[BRAND_KEY] as string) : null,
    metadata,
    options,
    variants: ((p.variants as Row[] | null) ?? []).map((v) => ({
      id: v.id as string,
      sku: (v.sku as string | null) ?? null,
      ean: (v.ean as string | null) ?? null,
      weight: num(v.weight),
      length: num(v.length),
      width: num(v.width),
      height: num(v.height),
      values: Object.fromEntries(
        ((v.options as Row[] | null) ?? []).map((ov) => [
          optionTitle.get(ov.option_id as string) ?? (ov.option_id as string),
          ov.value as string,
        ]),
      ),
      prices: ((v.prices as Row[] | null) ?? []).map((pr) => ({
        id: pr.id as string,
        currency_code: pr.currency_code as string,
        amount: Number(pr.amount),
        rules_count: num(pr.rules_count),
      })),
      metadata: (v.metadata as Record<string, unknown> | null) ?? {},
      requiredQuantity: num(((v.inventory_items as Row[] | null) ?? [])[0]?.required_quantity),
    })),
  };
}

// ── Informe ─────────────────────────────────────────────────────────────────

function report(plan: CatalogPlan, logger: { info: (m: string) => void }, prefix: string) {
  const c = plan.categories;
  const p = plan.products;
  logger.info(
    `${prefix}Categorías: ${c.create.length} nuevas, ${c.update.length} a actualizar, ${c.unchanged} sin cambios.`,
  );
  for (const u of c.update) logger.info(`${prefix}  ~ ${u.sheet.handle}: ${u.changes.join(", ")}`);
  for (const o of plan.options.create) {
    logger.info(`${prefix}Opción nueva: ${o.title} (${o.values.join(", ")})`);
  }
  for (const o of plan.options.addValues) {
    logger.info(`${prefix}Valores nuevos en ${o.title}: ${o.values.join(", ")}`);
  }
  if (plan.tags.length) logger.info(`${prefix}Etiquetas nuevas: ${plan.tags.join(", ")}`);
  const newVariants = p.create.reduce((n, x) => n + x.variants.length, 0);
  logger.info(
    `${prefix}Productos: ${p.create.length} nuevos (${newVariants} variantes), ` +
      `${p.update.length} a actualizar, ${p.unchanged} sin cambios.`,
  );
  for (const u of p.update.slice(0, MAX_REPORT)) {
    const parts = [
      ...(u.changes.length ? [u.changes.join(", ")] : []),
      ...(u.newVariants.length ? [`+${u.newVariants.length} variantes`] : []),
      ...u.variants.map((v) => `${v.sheet.sku} (${v.changes.join(", ")})`),
    ];
    logger.info(`${prefix}  ~ ${u.sheet.handle}: ${parts.join("; ")}`);
  }
}

// ── Escritura ───────────────────────────────────────────────────────────────

async function applyCategories(
  container: MedusaContainer,
  plan: CatalogPlan,
  snapshot: CatalogSnapshot,
) {
  const ids = new Map(snapshot.categories.map((c) => [c.handle, c.id]));
  const parentId = (handle: string | null | undefined) => {
    if (!handle) return null;
    const id = ids.get(handle);
    if (!id) throw new Error(`Categoría padre sin crear: ${handle}`);
    return id;
  };

  // Nuevas, por niveles: cada vuelta crea las que ya tienen el padre creado
  let pending: CategorySheet[] = [...plan.categories.create];
  while (pending.length) {
    const ready = pending.filter((c) => !c.parent || ids.has(c.parent));
    if (!ready.length) throw new Error("Categorías con padres imposibles de crear");
    const { result } = await createProductCategoriesWorkflow(container).run({
      input: {
        product_categories: ready.map((c) => ({
          name: c.name as string,
          handle: c.handle,
          is_active: c.active ?? true,
          parent_category_id: parentId(c.parent),
          ...(c.description ? { description: c.description } : {}),
          ...(c.rank !== undefined ? { rank: c.rank } : {}),
        })),
      },
    });
    for (const created of result) ids.set(created.handle, created.id);
    pending = pending.filter((c) => !ready.includes(c));
  }

  for (const u of plan.categories.update) {
    const c = u.sheet;
    await updateProductCategoriesWorkflow(container).run({
      input: {
        selector: { id: u.id },
        update: {
          ...(c.name ? { name: c.name } : {}),
          ...(c.parent !== undefined ? { parent_category_id: parentId(c.parent) } : {}),
          ...(c.description !== undefined ? { description: c.description ?? "" } : {}),
          ...(c.rank !== undefined ? { rank: c.rank } : {}),
          ...(c.active !== undefined ? { is_active: c.active } : {}),
        },
      },
    });
  }
}

async function applyOptionsAndTags(container: MedusaContainer, plan: CatalogPlan) {
  const productModule = container.resolve(Modules.PRODUCT);
  if (plan.options.create.length) {
    await createProductOptionsWorkflow(container).run({
      input: {
        product_options: plan.options.create.map((o) => ({
          title: o.title,
          values: o.values,
          is_exclusive: false,
          ranks: Object.fromEntries(o.values.map((v, r) => [v, r])),
        })),
      },
    });
  }
  for (const o of plan.options.addValues) {
    const [current] = await productModule.listProductOptions(
      { id: o.id },
      { relations: ["values"] },
    );
    const values = (current?.values ?? []).map((v) => v.value);
    await updateProductOptionsWorkflow(container).run({
      input: { selector: { id: o.id }, update: { values: [...values, ...o.values] } },
    });
  }
  if (plan.tags.length) {
    await createProductTagsWorkflow(container).run({
      input: { product_tags: plan.tags.map((value) => ({ value })) },
    });
  }
}

async function loadRefs(container: MedusaContainer): Promise<CatalogRefs> {
  const productModule = container.resolve(Modules.PRODUCT);
  const salesChannelModule = container.resolve(Modules.SALES_CHANNEL);
  const fulfillmentModule = container.resolve(Modules.FULFILLMENT);

  const [salesChannel] = await salesChannelModule.listSalesChannels({ name: SALES_CHANNEL_NAME });
  const [shippingProfile] = await fulfillmentModule.listShippingProfiles({ type: "default" });
  if (!salesChannel || !shippingProfile) {
    throw new Error("Falta el seed base. Ejecuta primero: pnpm --filter backend seed");
  }
  const categories = await productModule.listProductCategories(
    {},
    { select: ["id", "handle"], take: null },
  );
  const collections = await productModule.listProductCollections(
    {},
    { select: ["id", "handle"], take: null },
  );
  const tags = await productModule.listProductTags({}, { select: ["id", "value"], take: null });
  const types = await productModule.listProductTypes({}, { select: ["id", "value"], take: null });
  const options = (
    await productModule.listProductOptions(
      { is_exclusive: false },
      { relations: ["values"], take: null },
    )
  ).map(toDbOption);

  const must = <T>(value: T | undefined, what: string): T => {
    if (value === undefined) throw new Error(`No encontrado: ${what}`);
    return value;
  };
  const byHandle = (items: { id: string; handle: string }[]) =>
    new Map(items.map((i) => [i.handle, i.id]));
  const cat = byHandle(categories);
  const col = byHandle(collections);
  return {
    categoryId: (h) => must(cat.get(h), `categoría ${h}`),
    collectionId: (h) => must(col.get(h), `colección ${h}`),
    tagId: (v) => must(findByFold(tags, (t) => t.value, v)?.id, `etiqueta ${v}`),
    typeId: (iva) => {
      const value = IVA_TYPE[iva];
      return value ? must(types.find((t) => t.value === value)?.id, `tipo ${value}`) : null;
    },
    option: (title) =>
      must(
        findByFold(options, (o) => o.title, title),
        `opción ${title}`,
      ),
    salesChannelId: salesChannel.id,
    shippingProfileId: shippingProfile.id,
  };
}

/**
 * Granel: un artículo de inventario en gramos por variante (SKU = el de la variante). Si ya
 * existe uno con ese SKU sin variante (una carga anterior que falló a medias), se reutiliza.
 */
async function createBulkInventoryItems(
  container: MedusaContainer,
  variants: { sku: string; title: string }[],
) {
  const ids = new Map<string, string>();
  if (!variants.length) return ids;
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  for (const part of chunks(variants)) {
    const { data } = await query.graph({
      entity: "inventory_item",
      fields: ["id", "sku", "variants.id"],
      filters: { sku: part.map((v) => v.sku) },
    });
    for (const it of data as Row[]) {
      if (((it.variants as Row[] | null) ?? []).length) {
        throw new Error(`El artículo de inventario ${it.sku as string} ya tiene variante`);
      }
      ids.set(it.sku as string, it.id as string);
    }
  }
  const missing = variants.filter((v) => !ids.has(v.sku));
  for (const part of chunks(missing)) {
    const { result } = await createInventoryItemsWorkflow(container).run({
      input: {
        items: part.map((v) => ({
          sku: v.sku,
          title: `${v.title} (granel, gramos)`,
          unit_of_measure: GRAMS,
          requires_shipping: true,
        })),
      },
    });
    for (const it of result) ids.set(it.sku as string, it.id);
  }
  return ids;
}

/** Stock inicial de variantes recién creadas (solo las que aún no tienen nivel en el almacén). */
async function createStock(container: MedusaContainer, stockBySku: Map<string, number>) {
  if (!stockBySku.size) return 0;
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const stockLocationModule = container.resolve(Modules.STOCK_LOCATION);
  const [location] = await stockLocationModule.listStockLocations({});
  if (!location) throw new Error("Falta el almacén (seed base)");
  let created = 0;
  for (const skus of chunks([...stockBySku.keys()])) {
    const { data } = await query.graph({
      entity: "product_variant",
      fields: [
        "sku",
        "inventory_items.inventory_item_id",
        "inventory_items.inventory.location_levels.location_id",
      ],
      filters: { sku: skus },
    });
    const levels = (data as Row[]).flatMap((v) =>
      ((v.inventory_items as Row[] | null) ?? []).flatMap((link) => {
        const levels = ((link.inventory as Row | null)?.location_levels as Row[] | null) ?? [];
        if (levels.some((l) => l.location_id === location.id)) return [];
        return [
          {
            inventory_item_id: link.inventory_item_id as string,
            location_id: location.id,
            stocked_quantity: stockBySku.get(v.sku as string) ?? 0,
          },
        ];
      }),
    );
    if (levels.length) {
      await createInventoryLevelsWorkflow(container).run({ input: { inventory_levels: levels } });
      created += levels.length;
    }
  }
  return created;
}

/** Las opciones globales del producto, con TODOS sus valores actuales (grafía de Medusa). */
function withGlobalValues(product: DbProduct, refs: CatalogRefs): DbProduct {
  return {
    ...product,
    options: product.options.map((o) => {
      try {
        const global = refs.option(o.title);
        return global.id === o.id ? { ...o, values: global.values } : o;
      } catch {
        return o; // opción exclusiva (creada en el Admin)
      }
    }),
  };
}

async function applySale(container: MedusaContainer, products: ProductSheet[], dryRun: boolean) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const pricingModule = container.resolve(Modules.PRICING);
  const wanted = new Map(
    products.flatMap((p) =>
      p.variants.flatMap((v) => (v.salePrice !== undefined ? [[v.sku, v.salePrice] as const] : [])),
    ),
  );
  if (!wanted.size) return { create: 0, update: 0, delete: 0 };

  const [list] = (await pricingModule.listPriceLists({ q: SALE_LIST_TITLE })).filter(
    (l) => l.title === SALE_LIST_TITLE,
  );
  const variants: { id: string; sku: string; price_set_id: string }[] = [];
  for (const skus of chunks([...wanted.keys()])) {
    const { data } = await query.graph({
      entity: "product_variant",
      fields: ["id", "sku", "price_set.id"],
      filters: { sku: skus },
    });
    for (const v of data as Row[]) {
      const priceSet = (v.price_set as Row | null)?.id as string | undefined;
      if (priceSet)
        variants.push({ id: v.id as string, sku: v.sku as string, price_set_id: priceSet });
    }
  }
  const listPrices = list
    ? (
        await pricingModule.listPrices(
          { price_list_id: [list.id] },
          { select: ["id", "price_set_id", "amount", "currency_code"], take: null },
        )
      ).map((p) => ({
        id: p.id,
        price_set_id: p.price_set_id as string,
        amount: Number(p.amount),
        currency_code: p.currency_code as string,
      }))
    : [];
  const plan = planSale(wanted, variants, listPrices);
  // En dry-run, las variantes nuevas aún no existen: cuentan como ofertas nuevas
  const known = new Set(variants.map((v) => v.sku));
  const pendingNew = dryRun
    ? [...wanted].filter(([sku, amount]) => amount !== null && !known.has(sku)).length
    : 0;
  const counts = {
    create: plan.create.length + pendingNew,
    update: plan.update.length,
    delete: plan.delete.length,
  };
  if (dryRun || !(plan.create.length || plan.update.length || plan.delete.length)) return counts;

  let listId = list?.id;
  if (!listId) {
    const { result } = await createPriceListsWorkflow(container).run({
      input: {
        price_lists_data: [
          {
            title: SALE_LIST_TITLE,
            description:
              "Ofertas del importador de catálogo (columna precio_oferta). No editar a mano.",
            status: PriceListStatus.ACTIVE,
          },
        ],
      },
    });
    listId = result[0]?.id;
    if (!listId) throw new Error("No se pudo crear la Price List de ofertas");
  }
  await batchPriceListPricesWorkflow(container).run({
    input: {
      data: {
        id: listId,
        create: plan.create.map((p) => ({ ...p, currency_code: CURRENCY })),
        update: plan.update.map((p) => ({ ...p, currency_code: CURRENCY })),
        delete: plan.delete,
      },
    },
  });
  return counts;
}

// ── Script ──────────────────────────────────────────────────────────────────

export default async function importCatalog({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const dryRun = args.includes("dry-run");
  const dir = args.find((a) => a !== "dry-run");
  if (!dir) throw new Error("Uso: catalog:import <carpeta> [dry-run]");
  const root = path.resolve(dir);
  const prefix = dryRun ? "[dry-run] " : "";

  // 1. Hojas
  const [catText, prodText] = await Promise.all([
    readSheet(root, CATEGORIES_FILE),
    readSheet(root, PRODUCTS_FILE),
  ]);
  if (catText === null && prodText === null) {
    throw new Error(`No hay ${CATEGORIES_FILE} ni ${PRODUCTS_FILE} en ${root}`);
  }
  const errors: SheetIssue[] = [];
  const warnings: SheetIssue[] = [];
  const parse = (file: string, text: string) => {
    try {
      return parseCsv(text);
    } catch (e) {
      errors.push({ file, line: 1, message: (e as Error).message });
      return null;
    }
  };
  const catTable = catText !== null ? parse(CATEGORIES_FILE, catText) : null;
  const prodTable = prodText !== null ? parse(PRODUCTS_FILE, prodText) : null;
  const cats = catTable ? readCategories(catTable) : { categories: [], errors: [], warnings: [] };
  const prods = prodTable ? readProducts(prodTable) : { products: [], errors: [], warnings: [] };
  errors.push(...cats.errors, ...prods.errors);
  warnings.push(...cats.warnings, ...prods.warnings);
  logger.info(
    `${prefix}Hojas: ${cats.categories.length} categorías, ${prods.products.length} productos ` +
      `(${prods.products.reduce((n, p) => n + p.variants.length, 0)} variantes).`,
  );

  // 2. Plan contra Medusa
  const snapshot = await loadSnapshot(container, prods.products);
  const plan = planCatalog({ categories: cats.categories, products: prods.products }, snapshot);
  errors.push(...plan.errors);
  warnings.push(...plan.warnings);

  for (const w of warnings.slice(0, MAX_REPORT)) logger.warn(`Aviso: ${formatIssue(w)}`);
  if (errors.length) {
    for (const e of errors.slice(0, MAX_REPORT)) logger.error(formatIssue(e));
    if (errors.length > MAX_REPORT) logger.error(`… y ${errors.length - MAX_REPORT} errores más.`);
    throw new Error(`${errors.length} errores en las hojas: no se ha importado nada.`);
  }
  report(plan, logger, prefix);

  if (dryRun) {
    const sale = await applySale(container, prods.products, true);
    logger.info(
      `${prefix}Ofertas: ${sale.create} nuevas, ${sale.update} cambiadas, ${sale.delete} quitadas.`,
    );
    logger.info(`${prefix}Sin errores. Nada se ha escrito.`);
    return;
  }

  // 3. Categorías, opciones, etiquetas
  await applyCategories(container, plan, snapshot);
  await applyOptionsAndTags(container, plan);
  const refs = await loadRefs(container);

  // 4. Productos nuevos (+ stock). Granel: antes, sus artículos de inventario en gramos.
  const bulkVariants = [
    ...plan.products.create.flatMap((p) =>
      p.variants.filter((v) => v.bulk).map((v) => ({ sku: v.sku, title: p.title ?? p.handle })),
    ),
    ...plan.products.update.flatMap((u) =>
      u.newVariants.filter((v) => v.bulk).map((v) => ({ sku: v.sku, title: u.db.title })),
    ),
  ];
  const bulkItems = await createBulkInventoryItems(container, bulkVariants);
  const itemFor = (sku: string) => {
    const id = bulkItems.get(sku);
    if (!id) throw new Error(`Falta el artículo de inventario de ${sku}`);
    return id;
  };
  const stock = new Map<string, number>();
  let done = 0;
  for (const batch of chunks(plan.products.create, PRODUCT_BATCH)) {
    await createProductsWorkflow(container).run({
      input: { products: batch.map((p) => productCreateInput(p, refs, itemFor)) },
    });
    for (const p of batch) for (const v of p.variants) stock.set(v.sku, v.stock ?? 0);
    done += batch.length;
    logger.info(`Productos nuevos: ${done}/${plan.products.create.length}…`);
  }

  // 5. Productos existentes (datos, valores de opción, variantes)
  const queue = [...plan.products.update];
  await Promise.all(
    Array.from({ length: UPDATE_CONCURRENCY }, async () => {
      for (let u = queue.shift(); u; u = queue.shift()) {
        const product = withGlobalValues(u.db, refs);
        if (u.changes.length) {
          await updateProductsWorkflow(container).run({
            input: { products: [productUpdateInput(u, refs)] },
          });
        }
        if (u.linkValues.length) {
          await setProductProductOptionsWorkflow(container).run({
            input: {
              product_id: product.id,
              update: u.linkValues.map((l) => {
                const option = product.options.find((o) => o.id === l.optionId) as DbOption;
                return {
                  product_option_id: l.optionId,
                  add: l.values.map((value) => ({
                    value: findByFold(option.values, (x) => x.value, value)?.value ?? value,
                  })),
                };
              }),
            },
          });
        }
        if (u.newVariants.length || u.variants.length) {
          await batchProductVariantsWorkflow(container).run({
            input: {
              create: u.newVariants.map((v) => variantCreateInput(v, product, itemFor)),
              update: u.variants.map((v) => variantUpdateInput(v, product)),
            },
          });
          for (const v of u.newVariants) stock.set(v.sku, v.stock ?? 0);
        }
      }
    }),
  );
  const levels = await createStock(container, stock);

  // 6. Ofertas
  const sale = await applySale(container, prods.products, false);

  logger.info(
    `Catálogo importado: ${plan.categories.create.length} categorías nuevas y ` +
      `${plan.categories.update.length} actualizadas; ${plan.products.create.length} productos nuevos y ` +
      `${plan.products.update.length} actualizados; ${levels} niveles de stock; ofertas +${sale.create} ` +
      `~${sale.update} −${sale.delete}.`,
  );
  await clearMedusaCache(container);
}
