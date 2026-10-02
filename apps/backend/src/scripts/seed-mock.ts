/**
 * Catálogo de PRUEBA (fase 2) — solo desarrollo.
 *
 *   pnpm --filter backend seed:mock            # 24 productos (por defecto)
 *   pnpm --filter backend seed:mock -- 100     # N productos
 *
 * Genera productos deterministas (sin dependencias externas ni imágenes remotas),
 * repartidos en categorías y en los tres tipos de IVA:
 *   - general (21 %): sin tipo de producto
 *   - reducido (10 %): product_type "iva-reducido"
 *   - superreducido (4 %): product_type "iva-superreducido"
 * Cada producto tiene variantes de talla con precio en EUR (unidad principal, IVA incluido)
 * y stock en el almacén principal.
 *
 * Requiere haber ejecutado antes `pnpm --filter backend seed`.
 * Idempotente por handle: los productos `mock-*` existentes se omiten.
 */
import type { CreateInventoryLevelInput, ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils";
import {
  createInventoryLevelsWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
} from "@medusajs/medusa/core-flows";
import {
  PRODUCT_TYPE_IVA_REDUCIDO,
  PRODUCT_TYPE_IVA_SUPERREDUCIDO,
  SALES_CHANNEL_NAME,
} from "./seed";

const CATEGORIES = ["Ropa", "Hogar", "Alimentación", "Libros", "Accesorios"] as const;
type Category = (typeof CATEGORIES)[number];

/** Categoría → tipo de IVA de los productos mock (orientativo, solo para pruebas). */
const CATEGORY_TAX: Record<Category, string | null> = {
  Ropa: null,
  Hogar: null,
  Accesorios: null,
  Alimentación: PRODUCT_TYPE_IVA_REDUCIDO,
  Libros: PRODUCT_TYPE_IVA_SUPERREDUCIDO,
};

const ADJECTIVES = [
  "Clásico",
  "Esencial",
  "Premium",
  "Natural",
  "Urbano",
  "Artesano",
  "Ligero",
  "Vintage",
];
const NOUNS: Record<Category, string[]> = {
  Ropa: ["Camiseta", "Sudadera", "Pantalón", "Chaqueta"],
  Hogar: ["Taza", "Cojín", "Lámpara", "Manta"],
  Alimentación: ["Aceite de oliva", "Café en grano", "Miel", "Turrón"],
  Libros: ["Novela", "Guía de viaje", "Libro de cocina", "Cuaderno"],
  Accesorios: ["Mochila", "Gorra", "Cartera", "Bufanda"],
};
const SIZES: Record<Category, string[]> = {
  Ropa: ["S", "M", "L", "XL"],
  Hogar: ["Única"],
  Alimentación: ["250 g", "500 g"],
  Libros: ["Tapa blanda", "Tapa dura"],
  Accesorios: ["Única"],
};

export const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

/** Precio determinista entre 4,95 y 89,95 € (unidad principal, como guarda Medusa v2). */
export const priceFor = (i: number, v: number) =>
  Math.round((4.95 + ((i * 37 + v * 11) % 86)) * 100) / 100;

export default async function seedMockCatalog({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const productModuleService = container.resolve(Modules.PRODUCT);
  const salesChannelModuleService = container.resolve(Modules.SALES_CHANNEL);
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT);
  const stockLocationModuleService = container.resolve(Modules.STOCK_LOCATION);

  const count = Math.max(1, Math.min(1000, Number.parseInt(args?.[0] ?? "24", 10) || 24));

  const [salesChannel] = await salesChannelModuleService.listSalesChannels({
    name: SALES_CHANNEL_NAME,
  });
  const [shippingProfile] = await fulfillmentModuleService.listShippingProfiles({
    type: "default",
  });
  const [stockLocation] = await stockLocationModuleService.listStockLocations({});
  if (!salesChannel || !shippingProfile || !stockLocation) {
    throw new Error("Falta el seed base. Ejecuta primero: pnpm --filter backend seed");
  }

  // Tipos de producto (IVA) creados por el seed base
  // (el filtro `value` de product types solo admite un string → se filtra en memoria)
  const types = (await productModuleService.listProductTypes()).filter((t) =>
    [PRODUCT_TYPE_IVA_REDUCIDO, PRODUCT_TYPE_IVA_SUPERREDUCIDO].includes(t.value),
  );
  const typeId = (value: string | null) =>
    value ? types.find((t) => t.value === value)?.id : undefined;

  // Categorías (crea las que falten)
  const existingCats = await productModuleService.listProductCategories({ name: [...CATEGORIES] });
  const missing = CATEGORIES.filter((c) => !existingCats.some((e) => e.name === c));
  if (missing.length) {
    await createProductCategoriesWorkflow(container).run({
      input: {
        product_categories: missing.map((name) => ({ name, handle: slug(name), is_active: true })),
      },
    });
  }
  const categories = await productModuleService.listProductCategories({ name: [...CATEGORIES] });
  const categoryId = (name: Category) => categories.find((c) => c.name === name)?.id;

  // Productos (omite los handles ya existentes)
  const planned = Array.from({ length: count }, (_, i) => {
    const category = CATEGORIES[i % CATEGORIES.length] as Category;
    const nouns = NOUNS[category];
    const noun = nouns[Math.floor(i / CATEGORIES.length) % nouns.length] as string;
    const adjective = ADJECTIVES[i % ADJECTIVES.length] as string;
    const title = `${noun} ${adjective} ${String(i + 1).padStart(3, "0")}`;
    return { i, category, title, handle: `mock-${slug(title)}` };
  });
  const existing = await productModuleService.listProducts(
    { handle: planned.map((p) => p.handle) },
    { select: ["handle"] },
  );
  const toCreate = planned.filter((p) => !existing.some((e) => e.handle === p.handle));
  if (!toCreate.length) {
    logger.info(`Catálogo mock: los ${count} productos ya existen, nada que hacer.`);
    return;
  }

  logger.info(`Catálogo mock: creando ${toCreate.length} productos…`);
  for (let start = 0; start < toCreate.length; start += 25) {
    const batch = toCreate.slice(start, start + 25);
    await createProductsWorkflow(container).run({
      input: {
        products: batch.map(({ i, category, title, handle }) => {
          const sizes = SIZES[category];
          const type_id = typeId(CATEGORY_TAX[category]);
          const cat = categoryId(category);
          return {
            title,
            handle,
            subtitle: category,
            description: `${title}: producto de prueba generado para desarrollo (${category}).`,
            status: ProductStatus.PUBLISHED,
            weight: 200 + (i % 10) * 100,
            ...(type_id ? { type_id } : {}),
            ...(cat ? { category_ids: [cat] } : {}),
            shipping_profile_id: shippingProfile.id,
            sales_channels: [{ id: salesChannel.id }],
            options: [{ title: "Formato", values: sizes }],
            variants: sizes.map((size, v) => ({
              title: size,
              sku: `${handle}-${slug(size)}`.toUpperCase(),
              options: { Formato: size },
              manage_inventory: true,
              prices: [{ currency_code: "eur", amount: priceFor(i, v) }],
            })),
          };
        }),
      },
    });
  }

  // Stock para los inventory items sin nivel en el almacén
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
      stocked_quantity: n % 7 === 0 ? 0 : 5 + (n % 50), // algunos sin stock para probar la UI
    }));
  if (levels.length) {
    await createInventoryLevelsWorkflow(container).run({ input: { inventory_levels: levels } });
  }

  logger.info(
    `Catálogo mock listo: ${toCreate.length} productos nuevos, ${levels.length} niveles de stock.`,
  );
}
