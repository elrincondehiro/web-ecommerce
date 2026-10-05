import {
  defineSearchIndex,
  getVariantAvailability,
  graphConsume,
  graphSeed,
  QueryContext,
  search,
} from "@medusajs/framework/utils";

/**
 * Índice de búsqueda de productos (fase 7-1), servido por Meilisearch (decisión D1 = A).
 * Fuente: docs.medusajs.com/llms-full.txt (Search Module, Product Search Index Examples,
 * Store Search API Route), tipos de @medusajs/types 2.21.2 y el proveedor de
 * @rokmohar/medusa-plugin-meilisearch 2.3.1.
 *
 * - Campos planos (sin objetos anidados): la definición no depende del motor.
 * - `status` y `sales_channel_ids` los usa `POST /store/search` para limitar a productos
 *   publicados del canal de la publishable key; no se devuelven (`retrievable(false)`).
 * - Precios en EUR (única moneda de la tienda) con `QueryContext`; sirven para filtrar,
 *   ordenar y facetas de rango. El precio MOSTRADO se pide fresco al pintar (AGENTS §3.2).
 * - Sin `provider`: usa el del módulo (Meilisearch; PostgreSQL en tests, ver medusa-config).
 * - `locales: ["es"]` → `localizedAttributes` con `spa` en Meilisearch.
 * - La tolerancia a erratas se configura por índice: el storefront NO debe enviar
 *   `search_options.typo_tolerance` (Meilisearch lo rechaza).
 */

/**
 * Tipos de contexto tomados de la firma de `graphSeed`: en el árbol hay dos copias de
 * `@medusajs/types` 2.21.2 (peer de vite 7 y 8) y los de `@medusajs/framework/types` no
 * siempre coinciden con los que usa `@medusajs/framework/utils`.
 */
type IngestionContext = Parameters<NonNullable<Parameters<typeof graphSeed>[0]["transform"]>>[1];
type Query = IngestionContext["container"]["query"];

type PricedVariant = {
  calculated_price?: { calculated_amount?: number | null } | null;
};

type StockVariant = {
  id: string;
  manage_inventory?: boolean | null;
  allow_backorder?: boolean | null;
};

type ProductRow = {
  id: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  handle: string;
  thumbnail?: string | null;
  status: string;
  created_at: string | Date;
  sales_channels?: ({ id: string } | null)[] | null;
  variants?: (StockVariant | null)[] | null;
  categories?: ({ name?: string | null; handle?: string | null } | null)[] | null;
  tags?: ({ value?: string | null } | null)[] | null;
  options?:
    | ({ title?: string | null; values?: ({ value?: string | null } | null)[] | null } | null)[]
    | null;
};

const compact = (values: (string | null | undefined)[]) =>
  Array.from(new Set(values.filter((v): v is string => Boolean(v))));

/** `"Título:valor"` por cada valor de opción (guía "Index Option Values as a Facet"). */
function toOptionValues(options: ProductRow["options"]) {
  return compact(
    (options ?? []).flatMap((option) => {
      const title = option?.title?.trim();
      if (!title) return [];
      return (option?.values ?? []).map((v) => {
        const value = v?.value?.trim();
        return value ? `${title}:${value}` : null;
      });
    }),
  );
}

async function loadEurPrices(ids: string[], { container }: IngestionContext) {
  const prices = new Map<string, { min?: number; max?: number }>();
  if (!ids.length) return prices;
  const { data } = await container.query.graph({
    entity: "product",
    fields: ["id", "variants.calculated_price.calculated_amount"],
    filters: { id: ids },
    context: { variants: { calculated_price: QueryContext({ currency_code: "eur" }) } },
  });
  for (const product of data as { id: string; variants?: PricedVariant[] | null }[]) {
    const amounts = (product.variants ?? [])
      .map((v) => v?.calculated_price?.calculated_amount)
      .filter((a): a is number => typeof a === "number");
    if (amounts.length) {
      prices.set(product.id, { min: Math.min(...amounts), max: Math.max(...amounts) });
    }
  }
  return prices;
}

/**
 * Disponibilidad por producto, con el mismo criterio que el storefront (`lib/catalog.ts`):
 * hay stock si alguna variante no gestiona inventario, admite pedidos sin stock o tiene
 * cantidad disponible (stock − reservas, en los almacenes del canal) > 0.
 * Fuente: llms-full.txt "Retrieve Product Variant Inventory" (`getVariantAvailability`).
 */
async function loadInStock(rows: ProductRow[], { container }: IngestionContext) {
  const inStock = new Map<string, boolean>();
  const pending = new Map<string, Set<string>>(); // canal → variantes gestionadas
  for (const p of rows) {
    const variants = (p.variants ?? []).filter((v): v is StockVariant => Boolean(v));
    if (variants.some((v) => v.manage_inventory === false || v.allow_backorder)) {
      inStock.set(p.id, true);
      continue;
    }
    inStock.set(p.id, false);
    for (const sc of compact((p.sales_channels ?? []).map((s) => s?.id))) {
      const set = pending.get(sc) ?? new Set<string>();
      variants.forEach((v) => set.add(v.id));
      pending.set(sc, set);
    }
  }
  const available = new Set<string>();
  for (const [sales_channel_id, ids] of pending) {
    const result = await getVariantAvailability(container.query, {
      variant_ids: [...ids],
      sales_channel_id,
    });
    for (const [id, a] of Object.entries(result)) if ((a.availability ?? 0) > 0) available.add(id);
  }
  for (const p of rows) {
    if (!inStock.get(p.id) && (p.variants ?? []).some((v) => v && available.has(v.id))) {
      inStock.set(p.id, true);
    }
  }
  return inStock;
}

const fields = search.define({
  id: search.keyword().filterable().retrievable(),
  status: search.keyword().filterable().retrievable(false),
  sales_channel_ids: search.keyword().array().filterable().retrievable(false),
  title: search.text().searchable({ weight: 3 }).sortable().retrievable(),
  subtitle: search.text().searchable({ weight: 2 }).retrievable(),
  description: search.text().searchable({ weight: 1 }),
  handle: search.keyword().filterable().retrievable(),
  thumbnail: search.keyword().retrievable(),
  created_at: search.date().sortable().retrievable(),
  category_handles: search.keyword().array().filterable().facetable().retrievable(),
  category_names: search.keyword().array().searchable({ weight: 2 }).retrievable(),
  tags: search.keyword().array().searchable({ weight: 2 }).filterable().facetable().retrievable(),
  option_values: search
    .keyword()
    .array()
    .searchable({ weight: 2 })
    .filterable()
    .facetable()
    .retrievable(),
  min_price_eur: search
    .float()
    .filterable()
    .sortable()
    .facetable({ types: ["stats"] })
    .retrievable(),
  max_price_eur: search
    .float()
    .filterable()
    .sortable()
    .facetable({ types: ["stats"] })
    .retrievable(),
  in_stock: search.boolean().filterable().facetable().retrievable(),
});

const source = {
  fields: [
    "id",
    "title",
    "subtitle",
    "description",
    "handle",
    "thumbnail",
    "status",
    "created_at",
    "sales_channels.id",
    "variants.id",
    "variants.manage_inventory",
    "variants.allow_backorder",
    "categories.name",
    "categories.handle",
    "tags.value",
    "options.title",
    "options.values.value",
  ],
  transform: async (rows: ProductRow[], context: IngestionContext) => {
    const [prices, stock] = await Promise.all([
      loadEurPrices(
        rows.map((r) => r.id),
        context,
      ),
      loadInStock(rows, context),
    ]);
    return rows.map((p) => {
      const price = prices.get(p.id);
      return {
        id: p.id,
        status: p.status,
        sales_channel_ids: compact((p.sales_channels ?? []).map((s) => s?.id)),
        title: p.title,
        subtitle: p.subtitle ?? undefined,
        description: p.description ?? undefined,
        handle: p.handle,
        thumbnail: p.thumbnail ?? undefined,
        created_at: new Date(p.created_at),
        category_handles: compact((p.categories ?? []).map((c) => c?.handle)),
        category_names: compact((p.categories ?? []).map((c) => c?.name)),
        tags: compact((p.tags ?? []).map((t) => t?.value)),
        option_values: toOptionValues(p.options),
        ...(price ? { min_price_eur: price.min, max_price_eur: price.max } : {}),
        in_stock: stock.get(p.id) ?? false,
      };
    });
  },
};

function payloadIds(data: unknown): string[] {
  return (Array.isArray(data) ? data : [data])
    .map((entry) => (entry as { id?: string } | null)?.id)
    .filter((id): id is string => Boolean(id));
}

async function relatedProductIds(
  query: Query,
  entity: string,
  fieldList: string[],
  ids: string[],
  pick: (row: Record<string, unknown>) => (string | null | undefined)[],
  withDeleted: boolean,
) {
  const { data } = await query.graph({
    entity,
    fields: fieldList,
    filters: { id: ids },
    withDeleted,
  });
  return compact((data as Record<string, unknown>[]).flatMap(pick));
}

const productIdsOf = (row: Record<string, unknown>) =>
  ((row.products as ({ id?: string } | null)[] | undefined) ?? []).map((p) => p?.id);

/** Pasa de la entidad del evento a los productos que hay que reindexar (guía "Re-Index a Product…"). */
async function resolveProductIds(
  event: { name: string; data: unknown },
  { container }: IngestionContext,
): Promise<string[]> {
  const ids = payloadIds(event.data);
  if (!ids.length) return [];
  const [entity] = event.name.split(".");
  const deleted = event.name.endsWith(".deleted");
  switch (entity) {
    case "product":
      return ids;
    case "product-variant":
      return relatedProductIds(
        container.query,
        "product_variant",
        ["product_id"],
        ids,
        (row) => [row.product_id as string | undefined],
        deleted,
      );
    case "product-option":
      return relatedProductIds(
        container.query,
        "product_option",
        ["products.id"],
        ids,
        productIdsOf,
        deleted,
      );
    case "product-tag":
      return relatedProductIds(
        container.query,
        "product_tag",
        ["products.id"],
        ids,
        productIdsOf,
        deleted,
      );
    case "product-category":
      return relatedProductIds(
        container.query,
        "product_category",
        ["products.id"],
        ids,
        productIdsOf,
        deleted,
      );
    case "sales-channel": {
      const { search_result } = await container.query.search({
        entity: "product",
        fields: ["id"],
        filters: { sales_channel_ids: ids },
        pagination: { take: 100 },
      });
      return search_result.hits.map((hit) => hit.id);
    }
    default:
      return [];
  }
}

export default defineSearchIndex({
  name: "product",
  entity: "product",
  primary_key: "id",
  fields,
  settings: {
    typo_tolerance: { enabled: true },
    provider_options: { meilisearch: { locales: ["es"] } },
  },
  events: [
    "product.created",
    "product.updated",
    "product.deleted",
    "product-variant.created",
    "product-variant.updated",
    "product-variant.deleted",
    "product-option.updated",
    "product-tag.updated",
    "product-tag.deleted",
    "product-category.updated",
    "product-category.deleted",
    "sales-channel.deleted",
  ],
  consume: graphConsume({
    ...source,
    resolve_ids: resolveProductIds,
    is_delete: (event) => event.name === "product.deleted",
  }),
  seed: graphSeed(source),
});
