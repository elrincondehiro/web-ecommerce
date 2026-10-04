// Acceso a datos del storefront. Única puerta al backend (AGENTS.md §2).
// - Build (páginas estáticas): catálogo CON precio (IVA incluido, región ES) y stock del momento
//   del build; la server island <LiveSync> los corrige en runtime (lib/live-sync.ts, fase 6).
// - Server islands (runtime): mismos campos, solo para los productos visibles.
// - STOREFRONT_DATA=fixtures: mismos datos desde src/lib/__fixtures__ (CI sin backend).
import Medusa from "@medusajs/js-sdk";
import type { HttpTypes } from "@medusajs/types";
import {
  MEDUSA_BACKEND_URL,
  MEDUSA_PUBLISHABLE_KEY,
  STOREFRONT_DATA,
  STOREFRONT_MAX_PRODUCTS,
} from "astro:env/server";
import { productsInCategory, sliceRange, type StoreProduct } from "./catalog";

export type StoreCategory = HttpTypes.StoreProductCategory;
export type StoreCart = HttpTypes.StoreCart;
export interface StoreRegionRef {
  id: string;
  name: string;
  currency_code: string;
}

const COUNTRY_CODE = "es";
const ORDER = "title";
const CATALOG_FIELDS =
  "id,handle,title,subtitle,description,thumbnail,*images,*categories,*options,*options.values";
const PRICED_FIELDS = `${CATALOG_FIELDS},*variants,*variants.options,*variants.calculated_price,+variants.inventory_quantity`;
const CATEGORY_FIELDS = "id,name,handle,description,rank,parent_category_id";
const PAGE = 100;

const useFixtures = STOREFRONT_DATA === "fixtures";

let sdkInstance: Medusa | undefined;
function sdk(): Medusa {
  if (!MEDUSA_PUBLISHABLE_KEY) {
    throw new Error(
      "Falta MEDUSA_PUBLISHABLE_KEY. Configúrala en apps/storefront/.env o usa STOREFRONT_DATA=fixtures.",
    );
  }
  sdkInstance ??= new Medusa({
    baseUrl: MEDUSA_BACKEND_URL,
    publishableKey: MEDUSA_PUBLISHABLE_KEY,
  });
  return sdkInstance;
}

const fixtures = {
  region: async () => (await import("./__fixtures__/region.json")).default as StoreRegionRef,
  categories: async () =>
    (await import("./__fixtures__/categories.json")).default as unknown as StoreCategory[],
  products: async () =>
    (await import("./__fixtures__/products.json")).default as unknown as StoreProduct[],
};

let regionPromise: Promise<StoreRegionRef> | undefined;
/** Región de España (precios en EUR con IVA). Cacheada por proceso. */
export function getRegionES(): Promise<StoreRegionRef> {
  regionPromise ??= (async () => {
    if (useFixtures) return fixtures.region();
    const { regions } = await sdk().store.region.list({ limit: 50 });
    const region = regions.find((r) => r.countries?.some((c) => c.iso_2 === COUNTRY_CODE));
    if (!region) throw new Error(`No hay ninguna región con el país "${COUNTRY_CODE}"`);
    return { id: region.id, name: region.name ?? "", currency_code: region.currency_code ?? "eur" };
  })();
  regionPromise.catch(() => (regionPromise = undefined));
  return regionPromise;
}

/** Categorías de primer nivel ordenadas por `rank`. */
export async function getCategories(): Promise<StoreCategory[]> {
  const all = useFixtures
    ? await fixtures.categories()
    : (
        await sdk().store.category.list({
          limit: PAGE,
          fields: CATEGORY_FIELDS,
          parent_category_id: "null",
        })
      ).product_categories;
  return all.filter((c) => !c.parent_category_id).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
}

/** Todo el catálogo con precio y stock (build, getStaticPaths). Paginado contra la API. */
export async function getAllProducts(
  opts: { categoryId?: string | undefined } = {},
): Promise<StoreProduct[]> {
  const all = await (catalogPromise ??= loadCatalog());
  return opts.categoryId ? productsInCategory(all, opts.categoryId) : all;
}

// Memo de módulo: el catálogo se descarga UNA vez por build y lo reutilizan home, listados,
// categorías y fichas (antes: una descarga por categoría).
let catalogPromise: Promise<StoreProduct[]> | undefined;

async function loadCatalog(): Promise<StoreProduct[]> {
  const max = STOREFRONT_MAX_PRODUCTS ?? Infinity;
  if (useFixtures) return (await fixtures.products()).slice(0, max);
  const region = await getRegionES();
  const out: StoreProduct[] = [];
  for (let offset = 0; out.length < max; offset += PAGE) {
    const { products, count } = await sdk().store.product.list({
      limit: Math.min(PAGE, max - out.length),
      offset,
      order: ORDER,
      region_id: region.id,
      country_code: COUNTRY_CODE,
      fields: PRICED_FIELDS,
    });
    out.push(...products);
    if (out.length >= count || products.length === 0) break;
  }
  return out;
}

/**
 * Productos con precio y stock actuales (server island). Mismo orden que getAllProducts,
 * así offset/limit coinciden con la página estática.
 */
export async function getPricedProducts(q: {
  categoryId?: string | undefined;
  offset: number;
  limit: number;
}): Promise<StoreProduct[]> {
  if (useFixtures) {
    const all = await fixtures.products();
    return sliceRange(
      q.categoryId ? productsInCategory(all, q.categoryId) : all,
      q.offset,
      q.limit,
    );
  }
  const region = await getRegionES();
  const { products } = await sdk().store.product.list({
    limit: q.limit,
    offset: q.offset,
    order: ORDER,
    region_id: region.id,
    country_code: COUNTRY_CODE,
    fields: PRICED_FIELDS,
    ...(q.categoryId ? { category_id: q.categoryId } : {}),
  });
  return products;
}

// ── Carrito (runtime: actions, /carrito/, island del contador). Fase 4. ─────────────────────
// Importes en unidad principal y con IVA incluido (item_total, unit_price…). Ver fase4.md §3.

/** Campos mínimos para contar artículos (contador de la cabecera, respuesta de las actions). */
export const CART_COUNT_FIELDS =
  "id,completed_at,items.id,items.quantity,items.variant_id,items.product_title";
/** Campos de la página /carrito/ y del flyout. */
export const CART_FULL_FIELDS =
  "id,completed_at,currency_code,item_total,item_subtotal,item_tax_total," +
  "items.id,items.quantity,items.product_title,items.variant_title,items.product_handle," +
  "items.thumbnail,items.unit_price,items.total,items.variant_id";

function cartSdk(): Medusa {
  if (useFixtures) throw new Error("El carrito no está disponible con STOREFRONT_DATA=fixtures.");
  return sdk();
}

export async function createCart(fields = CART_COUNT_FIELDS): Promise<StoreCart> {
  const region = await getRegionES();
  const { cart } = await cartSdk().store.cart.create({ region_id: region.id }, { fields });
  return cart;
}

export async function retrieveCart(id: string, fields = CART_COUNT_FIELDS): Promise<StoreCart> {
  const { cart } = await cartSdk().store.cart.retrieve(id, { fields });
  return cart;
}

export async function addLineItem(
  cartId: string,
  variantId: string,
  quantity: number,
): Promise<StoreCart> {
  const { cart } = await cartSdk().store.cart.createLineItem(
    cartId,
    { variant_id: variantId, quantity },
    { fields: CART_COUNT_FIELDS },
  );
  return cart;
}

export async function updateLineItem(
  cartId: string,
  lineId: string,
  quantity: number,
): Promise<StoreCart> {
  const { cart } = await cartSdk().store.cart.updateLineItem(
    cartId,
    lineId,
    { quantity },
    { fields: CART_COUNT_FIELDS },
  );
  return cart;
}

export async function deleteLineItem(cartId: string, lineId: string): Promise<StoreCart | null> {
  const { parent } = await cartSdk().store.cart.deleteLineItem(cartId, lineId, {
    fields: CART_COUNT_FIELDS,
  });
  return parent ?? null;
}

// ── Checkout (runtime: /checkout/, /checkout/completar/, /pedido/). Fase 5. ───────────────────
// Flujo de la Store API (context7 /medusajs/medusa, storefront-development/checkout):
// email + direcciones → shipping method → payment session (Stripe) → complete.

export type StoreOrder = HttpTypes.StoreOrder;
export type StoreShippingOption = HttpTypes.StoreCartShippingOption;
export type CheckoutAddressInput = HttpTypes.StoreAddAddress;

/** Campos del carrito en /checkout/ (resumen, pasos completados y sesión de pago). */
export const CHECKOUT_FIELDS =
  `${CART_FULL_FIELDS},email,total,subtotal,tax_total,shipping_total,shipping_subtotal,` +
  "*shipping_address,*billing_address,shipping_methods.id,shipping_methods.name," +
  "shipping_methods.amount,shipping_methods.shipping_option_id,payment_collection.id," +
  "payment_collection.payment_sessions.id,payment_collection.payment_sessions.status," +
  "payment_collection.payment_sessions.amount,payment_collection.payment_sessions.provider_id," +
  "payment_collection.payment_sessions.data";

export async function updateCartContact(
  cartId: string,
  body: {
    email: string;
    shipping_address: CheckoutAddressInput;
    billing_address: CheckoutAddressInput;
  },
): Promise<StoreCart> {
  const { cart } = await cartSdk().store.cart.update(cartId, body, { fields: "id" });
  return cart;
}

export async function listShippingOptions(cartId: string): Promise<StoreShippingOption[]> {
  const { shipping_options } = await cartSdk().store.fulfillment.listCartOptions({
    cart_id: cartId,
  });
  return shipping_options;
}

export async function setShippingMethod(cartId: string, optionId: string): Promise<StoreCart> {
  const { cart } = await cartSdk().store.cart.addShippingMethod(
    cartId,
    { option_id: optionId },
    { fields: "id" },
  );
  return cart;
}

/** Crea (o reutiliza la colección de) la sesión de pago de Stripe. Devuelve el client_secret. */
export async function initiateStripeSession(
  cart: StoreCart,
  providerId: string,
): Promise<string | null> {
  const { payment_collection } = await cartSdk().store.payment.initiatePaymentSession(cart, {
    provider_id: providerId,
  });
  const session = payment_collection.payment_sessions?.find((s) => s.provider_id === providerId);
  const secret = session?.data?.client_secret;
  return typeof secret === "string" ? secret : null;
}

export type CompleteResult =
  { type: "order"; order: StoreOrder } | { type: "cart"; error: { message: string } };

/** Completa el carrito. Idempotente en Medusa (lock + order_cart): si ya hay pedido, lo devuelve. */
export async function completeCart(cartId: string): Promise<CompleteResult> {
  const res = await cartSdk().store.cart.complete(cartId, { fields: "id" });
  return res.type === "order"
    ? { type: "order", order: res.order }
    : { type: "cart", error: { message: res.error?.message ?? "" } };
}

export const ORDER_FIELDS =
  "id,display_id,email,created_at,currency_code,total,subtotal,tax_total,shipping_total," +
  "item_total,payment_status,*shipping_address,shipping_methods.name,shipping_methods.amount," +
  "items.id,items.quantity,items.product_title,items.variant_title,items.unit_price,items.total";

export async function retrieveOrder(id: string): Promise<StoreOrder> {
  const { order } = await cartSdk().store.order.retrieve(id, { fields: ORDER_FIELDS });
  return order;
}

/** Un producto con precio y stock por id (server island de la ficha). */
export async function getPricedProduct(id: string): Promise<StoreProduct | null> {
  if (useFixtures) return (await fixtures.products()).find((p) => p.id === id) ?? null;
  const region = await getRegionES();
  const { products } = await sdk().store.product.list({
    id: [id],
    limit: 1,
    region_id: region.id,
    country_code: COUNTRY_CODE,
    fields: PRICED_FIELDS,
  });
  return products[0] ?? null;
}
