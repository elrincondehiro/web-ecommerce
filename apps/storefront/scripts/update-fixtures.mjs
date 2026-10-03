// Regenera src/lib/__fixtures__/*.json desde un backend Medusa local (catálogo mock del seed).
// Uso: pnpm --filter storefront fixtures:update   (lee MEDUSA_BACKEND_URL y MEDUSA_PUBLISHABLE_KEY de .env)
// Los fixtures permiten `STOREFRONT_DATA=fixtures pnpm build` en CI sin backend.
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../src/lib/__fixtures__/", import.meta.url));
const baseUrl = process.env.MEDUSA_BACKEND_URL ?? "http://localhost:9000";
const key = process.env.MEDUSA_PUBLISHABLE_KEY;
if (!key) {
  process.stderr.write("Falta MEDUSA_PUBLISHABLE_KEY (apps/storefront/.env)\n");
  process.exit(1);
}

/** @param {string} path @param {Record<string, string>} query */
async function get(path, query = {}) {
  const url = new URL(path, baseUrl);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { "x-publishable-api-key": key } });
  if (!res.ok) throw new Error(`${res.status} ${url.pathname}: ${await res.text()}`);
  return res.json();
}

const { regions } = await get("/store/regions", { limit: "50" });
const region = regions.find((/** @type {any} */ r) =>
  r.countries?.some((/** @type {any} */ c) => c.iso_2 === "es"),
);
if (!region) throw new Error("No hay región con país ES");

const { product_categories } = await get("/store/product-categories", {
  limit: "100",
  fields: "id,name,handle,description,rank,parent_category_id",
});

// Mismos campos que usa el storefront: catálogo + precios/stock (para las server islands).
const { products } = await get("/store/products", {
  limit: "200",
  order: "title",
  region_id: region.id,
  country_code: "es",
  fields:
    "id,handle,title,subtitle,description,thumbnail,*images,*categories,*options,*options.values,*variants,*variants.options,*variants.calculated_price,+variants.inventory_quantity",
});

// Fixtures pequeños y estables: sin timestamps, metadatos ni campos no usados.
const DROP = new Set([
  "created_at",
  "updated_at",
  "deleted_at",
  "metadata",
  "raw_calculated_amount",
  "raw_original_amount",
  "calculated_price_list_id",
]);
const json = (/** @type {unknown} */ v) =>
  JSON.stringify(v, (k, val) => (DROP.has(k) || val === null ? undefined : val), 2) + "\n";
await writeFile(
  `${OUT}region.json`,
  json({ id: region.id, name: region.name, currency_code: region.currency_code }),
);
await writeFile(`${OUT}categories.json`, json(product_categories));
await writeFile(`${OUT}products.json`, json(products));
process.stdout.write(
  `Fixtures: región ${region.name}, ${product_categories.length} categorías, ${products.length} productos\n`,
);
