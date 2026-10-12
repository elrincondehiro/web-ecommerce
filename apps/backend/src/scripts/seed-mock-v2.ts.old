/**
 * Catálogo de PRUEBA v2 (fase 7) — solo desarrollo. Da datos para probar las facetas.
 *
 *   pnpm --filter backend seed:mock:v2          # etiquetas en los mock-* + 100 productos mock-v2-*
 *   pnpm --filter backend seed:mock:v2 40       # N productos mock-v2-*
 *
 * 1. Etiquetas (`product_tag`): crea las que falten y, al final, se las asigna a todos los
 *    productos `mock-*` (incluidos los v2) de forma determinista. NO toca variantes, handles ni imágenes, así que
 *    carritos, pedidos, el bucket y la caché de imágenes de Astro siguen valiendo.
 * 2. Opciones GLOBALES (`is_exclusive: false`, Medusa ≥ 2.16): Talla y Color, compartidas
 *    por todos los productos v2 (así la faceta suma bien; decisión D2b).
 * 3. Productos `mock-v2-*` (Ropa y Accesorios) con variantes Talla × Color, etiquetas,
 *    categoría, precio y stock (algunas variantes a 0).
 *
 * Idempotente: se puede relanzar; las etiquetas se reasignan igual y los handles v2
 * existentes se omiten. Requiere `seed` y `seed:mock`. Las fotos de los v2:
 * `images:mock` (omite las ya descargadas) + `images:import .cache/mock-images`.
 * Fuentes: tipos de @medusajs/types 2.21.2 (`CreateProductDTO.options` con `{ id, value_ids }`,
 * `CreateProductOptionDTO.is_exclusive`) y core-flows 2.21.2 (`createProductOptionsWorkflow`,
 * `createProductTagsWorkflow`, `updateProductsWorkflow` con `selector`).
 */
import type { CreateInventoryLevelInput, ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils";
import {
  createInventoryLevelsWorkflow,
  createProductOptionsWorkflow,
  createProductsWorkflow,
  createProductTagsWorkflow,
  updateProductsWorkflow,
} from "@medusajs/medusa/core-flows";
import { SALES_CHANNEL_NAME } from "./seed";
import { priceFor, slug } from "./seed-mock";

export const TAGS = [
  "novedad",
  "oferta",
  "ecológico",
  "hecho en España",
  "ideal para regalo",
  "edición limitada",
] as const;

const SIZES = ["S", "M", "L", "XL"] as const;
const COLORS = ["Rojo", "Verde", "Azul", "Amarillo"] as const;

/** Productos v2: categoría → nombres y si usan talla (las bufandas/carteras solo color). */
const V2_CATALOG = [
  { category: "Ropa", nouns: ["Polo", "Jersey", "Falda", "Vestido"], sized: true },
  { category: "Accesorios", nouns: ["Calcetines", "Guantes"], sized: true },
  { category: "Accesorios", nouns: ["Pañuelo", "Riñonera"], sized: false },
] as const;
const ADJECTIVES = ["Básico", "Deportivo", "Elegante", "Infantil", "Clásico"] as const;

/** 0–2 etiquetas por producto, deterministas por índice (≈ 1 de cada 3 sin etiqueta). */
export function tagsFor(i: number): string[] {
  const n = i % 3;
  return Array.from(
    { length: n },
    (_, k) => TAGS[(Math.floor(i / 3) + k * 2) % TAGS.length] as string,
  );
}

export default async function seedMockV2({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const productModule = container.resolve(Modules.PRODUCT);
  const salesChannelModule = container.resolve(Modules.SALES_CHANNEL);
  const fulfillmentModule = container.resolve(Modules.FULFILLMENT);
  const stockLocationModule = container.resolve(Modules.STOCK_LOCATION);

  const count = Math.max(0, Math.min(500, Number.parseInt(args?.[0] ?? "100", 10) || 100));

  const [salesChannel] = await salesChannelModule.listSalesChannels({ name: SALES_CHANNEL_NAME });
  const [shippingProfile] = await fulfillmentModule.listShippingProfiles({ type: "default" });
  const [stockLocation] = await stockLocationModule.listStockLocations({});
  if (!salesChannel || !shippingProfile || !stockLocation) {
    throw new Error("Falta el seed base. Ejecuta primero: pnpm --filter backend seed");
  }

  // 1. Etiquetas
  const existingTags = await productModule.listProductTags({ value: [...TAGS] });
  const missingTags = TAGS.filter((t) => !existingTags.some((e) => e.value === t));
  if (missingTags.length) {
    await createProductTagsWorkflow(container).run({
      input: { product_tags: missingTags.map((value) => ({ value })) },
    });
  }
  const tags = await productModule.listProductTags({ value: [...TAGS] });
  const tagId = (value: string) => tags.find((t) => t.value === value)?.id as string;

  // 2. Opciones globales Talla y Color
  const wantedOptions = [
    { title: "Talla", values: [...SIZES] },
    { title: "Color", values: [...COLORS] },
  ];
  const globals = await productModule.listProductOptions(
    { title: wantedOptions.map((o) => o.title), is_exclusive: false },
    { relations: ["values"] },
  );
  const missingOptions = wantedOptions.filter((o) => !globals.some((g) => g.title === o.title));
  if (missingOptions.length) {
    await createProductOptionsWorkflow(container).run({
      input: {
        product_options: missingOptions.map((o) => ({
          ...o,
          is_exclusive: false,
          ranks: Object.fromEntries(o.values.map((v, r) => [v, r])),
        })),
      },
    });
  }
  const options = await productModule.listProductOptions(
    { title: wantedOptions.map((o) => o.title), is_exclusive: false },
    { relations: ["values"] },
  );
  const option = (title: string) => {
    const found = options.find((o) => o.title === title);
    if (!found) throw new Error(`No existe la opción global ${title}`);
    return found;
  };
  const valueIds = (title: string, values: readonly string[]) =>
    (option(title).values ?? []).filter((v) => values.includes(v.value)).map((v) => v.id);

  // 3. Productos mock-v2-*
  const categories = await productModule.listProductCategories({
    name: [...new Set(V2_CATALOG.map((c) => c.category))],
  });
  const flat = V2_CATALOG.flatMap((c) => c.nouns.map((noun) => ({ ...c, noun })));
  const planned = Array.from({ length: count }, (_, i) => {
    const item = flat[i % flat.length] as (typeof flat)[number];
    const adjective = ADJECTIVES[Math.floor(i / flat.length) % ADJECTIVES.length] as string;
    const title = `${item.noun} ${adjective} ${String(i + 1).padStart(3, "0")}`;
    // Subconjunto determinista de valores para que las facetas no sean todas iguales
    const sizes = item.sized ? SIZES.filter((_, k) => (i + k) % 4 !== 3) : [];
    const colors = COLORS.filter((_, k) => (i + k) % 3 !== 2);
    return { i, ...item, title, handle: `mock-v2-${slug(title)}`, sizes, colors };
  });
  const existing = await productModule.listProducts(
    { handle: planned.map((p) => p.handle) },
    { select: ["handle"] },
  );
  const toCreate = planned.filter((p) => !existing.some((e) => e.handle === p.handle));

  for (let start = 0; start < toCreate.length; start += 20) {
    const batch = toCreate.slice(start, start + 20);
    await createProductsWorkflow(container).run({
      input: {
        products: batch.map((p) => {
          const cat = categories.find((c) => c.name === p.category)?.id;
          const combos = p.sized
            ? p.sizes.flatMap((size) => p.colors.map((color) => ({ Talla: size, Color: color })))
            : p.colors.map((color) => ({ Color: color }));
          return {
            title: p.title,
            handle: p.handle,
            subtitle: p.category,
            description: `${p.title}: producto de prueba v2 con talla y color (${p.category}).`,
            status: ProductStatus.PUBLISHED,
            weight: 150 + (p.i % 5) * 50,
            ...(cat ? { category_ids: [cat] } : {}),
            shipping_profile_id: shippingProfile.id,
            sales_channels: [{ id: salesChannel.id }],
            options: [
              ...(p.sized
                ? [{ id: option("Talla").id, value_ids: valueIds("Talla", p.sizes) }]
                : []),
              { id: option("Color").id, value_ids: valueIds("Color", p.colors) },
            ],
            variants: combos.map((opts, v) => ({
              title: Object.values(opts).join(" / "),
              sku: `${p.handle}-${slug(Object.values(opts).join("-"))}`.toUpperCase(),
              options: opts,
              manage_inventory: true,
              prices: [{ currency_code: "eur", amount: priceFor(p.i + 1000, v % 3) }],
            })),
          };
        }),
      },
    });
  }

  // Stock para los inventory items sin nivel (algunas variantes a 0)
  const { data: items } = await query.graph({
    entity: "inventory_item",
    fields: ["id", "location_levels.location_id"],
  });
  const levels: CreateInventoryLevelInput[] = (
    items as { id: string; location_levels?: { location_id: string }[] }[]
  )
    .filter((it) => !it.location_levels?.some((l) => l.location_id === stockLocation.id))
    .map((it, n) => ({
      inventory_item_id: it.id,
      location_id: stockLocation.id,
      stocked_quantity: n % 5 === 0 ? 0 : 3 + (n % 20),
    }));
  if (levels.length) {
    await createInventoryLevelsWorkflow(container).run({ input: { inventory_levels: levels } });
  }

  // 4. Etiquetas de todos los mock-* (también los v2), agrupadas por conjunto (pocas llamadas)
  const { data: mocks } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "tags.value"],
    filters: { handle: { $like: "mock-%" } },
    pagination: { order: { handle: "ASC" } },
  });
  const all = mocks as { id: string; handle: string; tags?: { value: string }[] }[];
  const groups = new Map<string, string[]>();
  all.forEach((p, i) => {
    const wanted = tagsFor(i).sort();
    const current = (p.tags ?? []).map((t) => t.value).sort();
    if (wanted.join("|") === current.join("|")) return;
    const key = wanted.join("|");
    groups.set(key, [...(groups.get(key) ?? []), p.id]);
  });
  for (const [key, ids] of groups) {
    const tag_ids = key ? key.split("|").map(tagId) : [];
    for (let s = 0; s < ids.length; s += 100) {
      await updateProductsWorkflow(container).run({
        input: { selector: { id: ids.slice(s, s + 100) }, update: { tag_ids } },
      });
    }
  }
  const retagged = [...groups.values()].reduce((n, ids) => n + ids.length, 0);
  logger.info(`Etiquetas: ${retagged} productos mock-* actualizados (de ${all.length}).`);

  logger.info(
    `Catálogo mock v2 listo: ${toCreate.length} productos nuevos (de ${count}), ${levels.length} niveles de stock.`,
  );
}
