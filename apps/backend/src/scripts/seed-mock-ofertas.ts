/**
 * Datos de PRUEBA de la fase I-Interficie — solo desarrollo. Idempotente y convergente.
 *
 *   pnpm --filter backend seed:mock:ofertas
 *
 * Trabaja sobre el catálogo BASE de `seed:mock` (los 24 primeros, sufijo 001–024: los mismos
 * que los fixtures del storefront), para que home y /ofertas/ tengan datos también en CI.
 * 1. Collection `destacados` (carrusel de la home): los 12 primeros por título.
 * 2. Price List `sale` "Ofertas de prueba" (activa, sin fechas): −20 % en las variantes de 8
 *    productos repartidos. Medusa la elige como `calculated_price` y deja el precio base como
 *    `original_amount` (una lista `sale` nunca es el precio original). El precio base NO
 *    cambia (Omnibus: precio anterior = precio base).
 * Si ya existen, se añaden los que falten y se quitan los que sobren.
 * Requiere `seed` y `seed:mock`. Fuentes: context7 /medusajs/medusa (Price Lists, "sale price",
 * price calculation) y tipos de core-flows 2.21.2: `createCollectionsWorkflow`,
 * `batchLinkProductsToCollectionWorkflow` (LinkWorkflowInput `add`/`remove`),
 * `createPriceListsWorkflow` (`price_lists_data`), `batchPriceListPricesWorkflow`
 * (`create`/`update`/`delete`).
 */
import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules, PriceListStatus } from "@medusajs/framework/utils";
import {
  batchLinkProductsToCollectionWorkflow,
  createCollectionsWorkflow,
  batchPriceListPricesWorkflow,
  createPriceListsWorkflow,
} from "@medusajs/medusa/core-flows";
import { CURRENCY } from "./seed";

export const FEATURED_HANDLE = "destacados";
export const FEATURED_COUNT = 12;
export const SALE_TITLE = "Ofertas de prueba";
export const BASE_COUNT = 24;
export const SALE_COUNT = 8;
export const SALE_DISCOUNT = 0.2;

/** Precio rebajado redondeado hacia abajo al ,x5 más cercano (precio "de tienda": 35,95 €). */
export function salePrice(amount: number, discount = SALE_DISCOUNT): number {
  const cents = Math.round(amount * (1 - discount) * 100);
  const rounded = Math.max(5, Math.floor((cents - 5) / 10) * 10 + 5);
  return rounded / 100;
}

/** Elige `count` elementos repartidos uniformemente (determinista). */
export function spread<T>(items: T[], count: number, offset = 0): T[] {
  if (items.length <= count) return items;
  const step = items.length / count;
  return Array.from(
    { length: count },
    (_, k) => items[(Math.floor(k * step) + offset) % items.length] as T,
  );
}

/** Catálogo base de seed:mock (sufijo ≤ BASE_COUNT, sin v2), por título. */
export function baseCatalog<T extends { handle: string; title: string }>(products: T[]): T[] {
  return products
    .filter((p) => !p.handle.startsWith("mock-v2-"))
    .filter((p) => {
      const n = Number(/-(\d{3})$/.exec(p.handle)?.[1] ?? NaN);
      return n >= 1 && n <= BASE_COUNT;
    })
    .sort((a, b) => a.title.localeCompare(b.title, "es"));
}

type MockProduct = {
  id: string;
  title: string;
  handle: string;
  collection_id?: string | null;
  variants?: ({
    id: string;
    price_set?: { id: string } | null;
    prices?: ({ amount: number; currency_code: string } | null)[];
  } | null)[];
};

export default async function seedMockOfertas({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const productModule = container.resolve(Modules.PRODUCT);
  const pricingModule = container.resolve(Modules.PRICING);

  const { data } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "handle",
      "collection_id",
      "variants.id",
      "variants.price_set.id",
      "variants.prices.*",
    ],
    filters: { handle: { $like: "mock-%" } },
  });
  const products = baseCatalog(data as MockProduct[]);
  if (!products.length) throw new Error("No hay productos mock-*. Ejecuta: pnpm backend:seed:mock");

  // 1. Collection destacados
  let [collection] = await productModule.listProductCollections({ handle: FEATURED_HANDLE });
  if (!collection) {
    const { result } = await createCollectionsWorkflow(container).run({
      input: { collections: [{ title: "Destacados", handle: FEATURED_HANDLE }] },
    });
    collection = result[0];
  }
  if (!collection) throw new Error("No se pudo crear la Collection destacados");
  const featured = products.slice(0, FEATURED_COUNT);
  const toLink = featured.filter((p) => p.collection_id !== collection.id).map((p) => p.id);
  const { data: linked } = await query.graph({
    entity: "product",
    fields: ["id"],
    filters: { collection_id: collection.id },
  });
  const wanted = new Set(featured.map((p) => p.id));
  const toUnlink = (linked as { id: string }[]).filter((p) => !wanted.has(p.id)).map((p) => p.id);
  if (toLink.length || toUnlink.length) {
    await batchLinkProductsToCollectionWorkflow(container).run({
      input: { id: collection.id, add: toLink, remove: toUnlink },
    });
  }

  // 2. Price List sale (offset 1: no coincide del todo con los destacados)
  const onSale = spread(products, SALE_COUNT, 1);
  // Tipo `sale`: es el valor por defecto del modelo PriceList (pricing 2.21.2); el DTO del
  // workflow no declara `type`, así que no se pasa.
  let [priceList] = await pricingModule.listPriceLists({ q: SALE_TITLE });
  if (!priceList) {
    const { result } = await createPriceListsWorkflow(container).run({
      input: {
        price_lists_data: [
          {
            title: SALE_TITLE,
            description: "Rebaja de prueba (seed:mock:ofertas). Solo desarrollo.",
            status: PriceListStatus.ACTIVE,
          },
        ],
      },
    });
    priceList = result[0];
  }
  if (!priceList) throw new Error("No se pudo crear la Price List");

  const existing = await pricingModule.listPrices(
    { price_list_id: [priceList.id] },
    { select: ["id", "price_set_id"] },
  );
  // `variants.prices` excluye los precios de listas: se cruza por price_set_id.
  const withPrice = new Set(existing.map((p) => p.price_set_id));
  const wantedSets = new Set(
    onSale.flatMap((p) => (p.variants ?? []).map((v) => v?.price_set?.id).filter(Boolean)),
  );

  const create = onSale.flatMap((p) =>
    (p.variants ?? []).flatMap((v) => {
      const base = v?.prices?.find((pr) => pr?.currency_code === CURRENCY);
      if (!v || !base || (v.price_set && withPrice.has(v.price_set.id))) return [];
      return [
        { variant_id: v.id, currency_code: CURRENCY, amount: salePrice(Number(base.amount)) },
      ];
    }),
  );
  const remove = existing.filter((p) => !wantedSets.has(p.price_set_id)).map((p) => p.id);
  if (create.length || remove.length) {
    await batchPriceListPricesWorkflow(container).run({
      input: { data: { id: priceList.id, create, update: [], delete: remove } },
    });
  }

  logger.info(
    `Ofertas de prueba: Collection "${FEATURED_HANDLE}" (+${toLink.length} / −${toUnlink.length}, ` +
      `${featured.length} productos); ` +
      `Price List "${SALE_TITLE}" (+${create.length} / −${remove.length} precios, ${onSale.length} productos).`,
  );
}
