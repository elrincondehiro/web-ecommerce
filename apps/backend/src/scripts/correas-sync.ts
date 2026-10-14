/**
 * Correa a medida (Fase E-2): crea y actualiza los productos de correa desde sus hojas.
 *
 *   pnpm --filter backend correas:sync <carpeta> [dry-run]
 *
 * - `<carpeta>` con `correas.csv`, `largos.csv`, `mosquetones.csv`, `piezas.csv` y `ajustes.csv`
 *   (formato y ejemplo en `apps/backend/catalog/plantilla/correas/`).
 * - Valida TODO antes de escribir: con un solo error no cambia nada.
 * - Piezas (artículos de inventario): crea las que faltan con su `stock_inicial` en el almacén.
 *   **Nunca cambia el stock** de una pieza que ya existe: la cuerda se repone en el Admin al
 *   abrir un rollo (ver LEEME).
 * - Productos (upsert por `handle`) y variantes (upsert por SKU): opciones, precio, peso,
 *   metadata y kit. Si cambian los largos o los mosquetones, crea las variantes nuevas y borra
 *   las que sobran (la hoja manda: las correas no se editan a mano).
 * - Idempotente: volver a sincronizar las mismas hojas no cambia nada.
 *
 * Fuentes: context7 /medusajs/medusa (inventory kits: `inventory_items` con `required_quantity`
 * en createProductsWorkflow; batchVariants: «los precios sin mencionar se borran») y código de
 * @medusajs/core-flows 2.21.2 (batchProductVariantsWorkflow, batchLinksWorkflow — la ruta
 * `POST /admin/products/:id/variants/inventory-items/batch` —, createInventoryItemsWorkflow,
 * updateProductOptionsWorkflow). Medido en E-2a (docs/fases/faseE-urls-correas.md).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ExecArgs, LinkDefinition, MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  batchLinksWorkflow,
  batchProductVariantsWorkflow,
  createInventoryItemsWorkflow,
  createProductsWorkflow,
  updateInventoryItemsWorkflow,
  updateProductOptionsWorkflow,
  updateProductsWorkflow,
} from "@medusajs/medusa/core-flows";
import { SALES_CHANNEL_NAME } from "./seed";
import { decodeUtf8 } from "./lib/csv";
import { CURRENCY } from "./lib/catalog-plan";
import { CORREA_FILES, readCorreaSheets } from "./lib/correas-sheet";
import {
  OPTION_TITLES,
  buildWanted,
  planCorreas,
  type CorreaPlan,
  type DbCorreaProduct,
  type DbPiece,
  type ProductWanted,
  type VariantWanted,
} from "./lib/correas-plan";

type Row = Record<string, unknown>;
const BATCH = 100;

const chunks = <T>(items: T[], size = BATCH) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );

async function readSheets(dir: string) {
  const texts: Record<string, string | null> = {};
  for (const file of Object.values(CORREA_FILES)) {
    try {
      texts[file] = decodeUtf8(await readFile(path.join(dir, file)));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      texts[file] = null;
    }
  }
  return texts;
}

async function loadDb(
  container: MedusaContainer,
  handles: string[],
  skus: string[],
  category: string,
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const productModule = container.resolve(Modules.PRODUCT);
  const [cat] = await productModule.listProductCategories({ handle: category }, { select: ["id"] });

  const pieces: DbPiece[] = [];
  for (const part of chunks(skus)) {
    const { data } = await query.graph({
      entity: "inventory_item",
      fields: ["id", "sku", "title", "unit_of_measure"],
      filters: { sku: part },
    });
    for (const it of data as Row[]) {
      pieces.push({
        id: it.id as string,
        sku: it.sku as string,
        title: (it.title as string | null) ?? null,
        unit: (it.unit_of_measure as string | null) ?? null,
      });
    }
  }

  const products: DbCorreaProduct[] = [];
  const skuOwners = new Map<string, string>();
  const { data } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "handle",
      "title",
      "description",
      "material",
      "status",
      "metadata",
      "categories.id",
      "options.id",
      "options.title",
      "options.values.value",
      "variants.id",
      "variants.sku",
      "variants.title",
      "variants.weight",
      "variants.metadata",
      "variants.options.value",
      "variants.options.option_id",
      "variants.prices.id",
      "variants.prices.amount",
      "variants.prices.currency_code",
      "variants.prices.rules_count",
      "variants.inventory_items.inventory_item_id",
      "variants.inventory_items.required_quantity",
    ],
    filters: { handle: handles },
  });
  for (const p of data as Row[]) {
    const options = new Map(
      ((p.options as Row[] | null) ?? []).map((o) => [
        o.title as string,
        {
          id: o.id as string,
          values: ((o.values as Row[] | null) ?? []).map((v) => v.value as string),
        },
      ]),
    );
    const titleById = new Map([...options].map(([t, o]) => [o.id, t]));
    products.push({
      id: p.id as string,
      handle: p.handle as string,
      title: p.title as string,
      description: (p.description as string | null) ?? null,
      material: (p.material as string | null) ?? null,
      status: p.status as string,
      metadata: (p.metadata as Row | null) ?? {},
      categoryIds: ((p.categories as Row[] | null) ?? []).map((c) => c.id as string),
      options,
      variants: ((p.variants as Row[] | null) ?? []).map((v) => {
        const base = ((v.prices as Row[] | null) ?? []).find(
          (pr) => pr.currency_code === CURRENCY && !Number(pr.rules_count ?? 0),
        );
        return {
          id: v.id as string,
          sku: (v.sku as string | null) ?? "",
          title: v.title as string,
          options: Object.fromEntries(
            ((v.options as Row[] | null) ?? []).map((ov) => [
              titleById.get(ov.option_id as string) ?? (ov.option_id as string),
              ov.value as string,
            ]),
          ),
          basePrice: base ? { id: base.id as string, amount: Number(base.amount) } : null,
          weight: v.weight === null || v.weight === undefined ? null : Number(v.weight),
          metadata: (v.metadata as Row | null) ?? {},
          kit: new Map(
            ((v.inventory_items as Row[] | null) ?? []).map((l) => [
              l.inventory_item_id as string,
              Number(l.required_quantity ?? 1),
            ]),
          ),
        };
      }),
    });
  }
  // Dueños de los SKU de variante deseados en toda la tienda (colisiones con otros productos)
  for (const part of chunks(skus.filter((s) => !pieces.some((p) => p.sku === s)))) {
    const { data: vs } = await query.graph({
      entity: "product_variant",
      fields: ["sku", "product.handle"],
      filters: { sku: part },
    });
    for (const v of vs as Row[]) {
      skuOwners.set(v.sku as string, ((v.product as Row | null)?.handle as string) ?? "?");
    }
  }
  return { pieces, products, categoryId: cat?.id ?? null, skuOwners };
}

function report(plan: CorreaPlan, log: (m: string) => void, prefix: string) {
  const { pieces, products } = plan;
  log(
    `${prefix}Piezas: ${pieces.create.length} nuevas` +
      (pieces.create.length
        ? ` (${pieces.create.map((p) => `${p.sku} = ${p.stock}`).join(", ")})`
        : "") +
      `, ${pieces.rename.length} renombradas.`,
  );
  log(
    `${prefix}Correas: ${products.create.length} nuevas, ${products.update.length} con cambios, ` +
      `${products.unchanged} sin cambios.`,
  );
  for (const p of products.create) log(`${prefix}  + ${p.handle} (${p.variants.length} variantes)`);
  for (const u of products.update) {
    const counts = new Map<string, number>();
    for (const v of u.update) for (const c of v.changes) counts.set(c, (counts.get(c) ?? 0) + 1);
    const parts = [
      ...u.changes,
      ...u.addValues.map((a) => `${a.title} +${a.values.join(", ")}`),
      ...(u.create.length ? [`+${u.create.length} variantes`] : []),
      ...(u.remove.length ? [`−${u.remove.length} variantes`] : []),
      ...[...counts].map(([c, n]) => `${c} en ${n} variantes`),
    ];
    log(`${prefix}  ~ ${u.db.handle}: ${parts.join(" · ")}`);
  }
}

export default async function correasSync({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const dryRun = args.includes("dry-run");
  const dir = args.find((a) => a !== "dry-run");
  if (!dir) throw new Error("Uso: correas:sync <carpeta> [dry-run]");
  const prefix = dryRun ? "[dry-run] " : "";

  // 1. Hojas
  const { sheets, errors } = readCorreaSheets(await readSheets(path.resolve(dir)));
  if (errors.length) {
    for (const e of errors.slice(0, 50)) {
      logger.error(`${e.file}:${e.line}${e.column ? ` [${e.column}]` : ""} ${e.message}`);
    }
    throw new Error(`${errors.length} errores en las hojas: no se ha cambiado nada.`);
  }
  const wanted = buildWanted(sheets);
  logger.info(
    `${prefix}Hojas: ${wanted.products.length} correas × ${wanted.products[0]?.variants.length ?? 0} ` +
      `variantes, ${wanted.pieces.length} piezas.`,
  );

  // 2. Plan contra Medusa
  const db = await loadDb(
    container,
    wanted.products.map((p) => p.handle),
    [
      ...wanted.pieces.map((p) => p.sku),
      ...wanted.products.flatMap((p) => p.variants.map((v) => v.sku)),
    ],
    wanted.category,
  );
  const plan = planCorreas(wanted, db);
  if (plan.errors.length) {
    for (const e of plan.errors.slice(0, 50)) logger.error(e);
    throw new Error(`${plan.errors.length} errores: no se ha cambiado nada.`);
  }
  report(plan, (m) => logger.info(m), prefix);
  if (dryRun) {
    logger.info(`${prefix}Sin errores. Nada se ha escrito.`);
    return;
  }
  const categoryId = db.categoryId as string;

  // 3. Piezas: las nuevas con su stock inicial; las existentes solo cambian de nombre
  const salesChannelModule = container.resolve(Modules.SALES_CHANNEL);
  const fulfillmentModule = container.resolve(Modules.FULFILLMENT);
  const stockLocationModule = container.resolve(Modules.STOCK_LOCATION);
  const [salesChannel] = await salesChannelModule.listSalesChannels({ name: SALES_CHANNEL_NAME });
  const [shippingProfile] = await fulfillmentModule.listShippingProfiles({ type: "default" });
  const [location] = await stockLocationModule.listStockLocations({});
  if (!salesChannel || !shippingProfile || !location) {
    throw new Error("Falta el seed base. Ejecuta primero: pnpm --filter backend seed");
  }
  const pieceIds = new Map(db.pieces.map((p) => [p.sku, p.id]));
  if (plan.pieces.create.length) {
    const { result } = await createInventoryItemsWorkflow(container).run({
      input: {
        items: plan.pieces.create.map((p) => ({
          sku: p.sku,
          title: p.title,
          requires_shipping: true,
          ...(p.unit ? { unit_of_measure: p.unit } : {}),
          location_levels: [{ location_id: location.id, stocked_quantity: p.stock }],
        })),
      },
    });
    for (const it of result) pieceIds.set(it.sku as string, it.id);
  }
  if (plan.pieces.rename.length) {
    await updateInventoryItemsWorkflow(container).run({
      input: { updates: plan.pieces.rename.map((r) => ({ id: r.db.id, title: r.title })) },
    });
  }
  const pieceId = (sku: string) => {
    const id = pieceIds.get(sku);
    if (!id) throw new Error(`Falta la pieza ${sku}`);
    return id;
  };
  const kitInput = (v: VariantWanted) =>
    v.kit.map((k) => ({ inventory_item_id: pieceId(k.sku), required_quantity: k.quantity }));
  const variantInput = (v: VariantWanted) => ({
    title: v.title,
    sku: v.sku,
    options: v.options,
    weight: v.weight,
    metadata: v.metadata,
    manage_inventory: true,
    allow_backorder: false,
    prices: [{ currency_code: CURRENCY, amount: v.price }],
  });
  const productFields = (p: ProductWanted) => ({
    title: p.title,
    description: p.description ?? "",
    material: p.material,
    status: p.status,
    metadata: p.metadata,
  });

  // 4. Correas nuevas (una a una: 117 variantes con kit ≈ 0,6 s cada una, medido en E-2a)
  for (const p of plan.products.create) {
    await createProductsWorkflow(container).run({
      input: {
        products: [
          {
            ...productFields(p),
            handle: p.handle,
            shipping_profile_id: shippingProfile.id,
            sales_channels: [{ id: salesChannel.id }],
            category_ids: [categoryId],
            options: p.options.map((o) => ({ title: o.title, values: o.values })),
            variants: p.variants.map((v) => ({ ...variantInput(v), inventory_items: kitInput(v) })),
          },
        ],
      },
    });
    logger.info(`Correa creada: ${p.handle}`);
  }

  // 5. Correas existentes
  for (const u of plan.products.update) {
    if (u.changes.length) {
      await updateProductsWorkflow(container).run({
        input: {
          products: [
            {
              id: u.db.id,
              ...productFields(u.want),
              ...(u.changes.includes("categoría")
                ? { category_ids: [...new Set([...u.db.categoryIds, categoryId])] }
                : {}),
            },
          ],
        },
      });
    }
    for (const a of u.addValues) {
      const cur = u.db.options.get(a.title);
      await updateProductOptionsWorkflow(container).run({
        input: {
          selector: { id: a.optionId },
          update: { values: [...(cur?.values ?? []), ...a.values] },
        },
      });
    }
    const priced = u.update.filter((c) => c.changes.some((x) => x !== "kit"));
    if (u.create.length || priced.length || u.remove.length) {
      await batchProductVariantsWorkflow(container).run({
        input: {
          create: u.create.map((v) => ({
            ...variantInput(v),
            product_id: u.db.id,
            inventory_items: kitInput(v),
          })),
          update: priced.map(({ db: dv, want: v, changes }) => ({
            id: dv.id,
            ...(changes.includes("opciones") ? { options: v.options, title: v.title } : {}),
            ...(changes.includes("peso") ? { weight: v.weight } : {}),
            ...(changes.includes("metadata") ? { metadata: v.metadata } : {}),
            ...(changes.includes("precio")
              ? {
                  // Al pasar `prices`, Medusa borra los no mencionados: solo existe el EUR base
                  prices: [
                    dv.basePrice
                      ? { id: dv.basePrice.id, currency_code: CURRENCY, amount: v.price }
                      : { currency_code: CURRENCY, amount: v.price },
                  ],
                }
              : {}),
          })),
          delete: u.remove.map((v) => v.id),
        },
      });
    }
    // Kits cambiados: enlaces variante ↔ pieza (crear, actualizar cantidad, quitar)
    const create: LinkDefinition[] = [];
    const update: LinkDefinition[] = [];
    const remove: LinkDefinition[] = [];
    const link = (variantId: string, itemId: string): LinkDefinition => ({
      [Modules.PRODUCT]: { variant_id: variantId },
      [Modules.INVENTORY]: { inventory_item_id: itemId },
    });
    for (const { db: dv, want: v, changes } of u.update) {
      if (!changes.includes("kit")) continue;
      const want = new Map(v.kit.map((k) => [pieceId(k.sku), k.quantity]));
      for (const [itemId, qty] of want) {
        const cur = dv.kit.get(itemId);
        if (cur === undefined)
          create.push({ ...link(dv.id, itemId), data: { required_quantity: qty } });
        else if (Math.abs(cur - qty) > 1e-9) {
          update.push({ ...link(dv.id, itemId), data: { required_quantity: qty } });
        }
      }
      for (const itemId of dv.kit.keys()) if (!want.has(itemId)) remove.push(link(dv.id, itemId));
    }
    if (create.length || update.length || remove.length) {
      await batchLinksWorkflow(container).run({
        input: { create, update, delete: remove },
      });
    }
    logger.info(`Correa actualizada: ${u.db.handle}`);
  }

  logger.info(
    `Correas sincronizadas: ${plan.products.create.length} nuevas, ${plan.products.update.length} ` +
      `actualizadas, ${plan.pieces.create.length} piezas nuevas. El stock de las piezas existentes ` +
      `no se ha tocado. Opciones: ${OPTION_TITLES.join(" · ")}.`,
  );
}
