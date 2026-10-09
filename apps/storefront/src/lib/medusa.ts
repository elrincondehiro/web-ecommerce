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
  SEARCH_CARD_CACHE_TTL,
  STOREFRONT_DATA,
  STOREFRONT_MAX_PRODUCTS,
} from "astro:env/server";
import { CardCache } from "./card-cache";
import { productsInCategory, sliceRange, type StoreProduct } from "./catalog";
import type { RawSearchResult, SearchQueryBody } from "./search";

export type StoreCategory = HttpTypes.StoreProductCategory;
export type StoreCart = HttpTypes.StoreCart;
export type StoreCollection = HttpTypes.StoreCollection;
export interface StoreRegionRef {
  id: string;
  name: string;
  currency_code: string;
}

const COUNTRY_CODE = "es";
const ORDER = "title";
const CATALOG_FIELDS =
  "id,handle,title,subtitle,description,thumbnail,collection_id,*images,*categories,*options,*options.values,*tags";
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
    // Una instancia para TODAS las peticiones del servidor: nunca guarda el token del cliente
    // (fase 9). Las llamadas de cuenta lo pasan en `Authorization` por petición.
    auth: { type: "jwt", jwtTokenStorageMethod: "nostore" },
  });
  return sdkInstance;
}

const fixtures = {
  region: async () => (await import("./__fixtures__/region.json")).default as StoreRegionRef,
  categories: async () =>
    (await import("./__fixtures__/categories.json")).default as unknown as StoreCategory[],
  products: async () =>
    (await import("./__fixtures__/products.json")).default as unknown as StoreProduct[],
  collections: async () =>
    (await import("./__fixtures__/collections.json")).default as unknown as StoreCollection[],
  offers: async () => (await import("./__fixtures__/offers.json")).default as string[],
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

/** Collection por handle (carrusel de la home, I-Interficie). Null si no existe. */
export async function getCollectionByHandle(handle: string): Promise<StoreCollection | null> {
  const all = useFixtures
    ? await fixtures.collections()
    : (await sdk().store.collection.list({ handle, fields: "id,title,handle" })).collections;
  return all.find((c) => c.handle === handle) ?? null;
}

/** Productos de una Collection, del catálogo del build (mismo orden: título). */
export async function getCollectionProducts(collectionId: string): Promise<StoreProduct[]> {
  return (await getAllProducts()).filter((p) => p.collection_id === collectionId);
}

/**
 * Ids de productos en oferta (Price List `sale` vigente en la región), por título. Ruta propia
 * del backend `GET /store/ofertas` (la Store API no filtra por Price List; D5 = A).
 */
export function getSaleProductIds(): Promise<string[]> {
  // Memo de módulo (como el catálogo): /ofertas/, su manifiesto (ofertas/paginas.json) y la home
  // ven la MISMA lista aunque una oferta cambie a mitad del build. Solo build y `astro dev`: en
  // producción la island de /ofertas/ lee el manifiesto (lib/offer-pages.ts).
  return (saleIdsPromise ??= loadSaleProductIds());
}
let saleIdsPromise: Promise<string[]> | undefined;

async function loadSaleProductIds(): Promise<string[]> {
  if (useFixtures) return fixtures.offers();
  const region = await getRegionES();
  const { product_ids } = await sdk().client.fetch<{ product_ids: string[] }>("/store/ofertas", {
    query: { region_id: region.id },
  });
  return product_ids;
}

/** Productos en oferta del catálogo del build (build de /ofertas/ y del banner de la home). */
export async function getSaleProducts(): Promise<StoreProduct[]> {
  const [ids, all] = await Promise.all([getSaleProductIds(), getAllProducts()]);
  const set = new Set(ids);
  return all.filter((p) => set.has(p.id));
}

/**
 * Productos con precio y stock actuales (server island). Mismo orden que getAllProducts,
 * así offset/limit coinciden con la página estática.
 */
export async function getPricedProducts(q: {
  categoryId?: string | undefined;
  collectionId?: string | undefined;
  offset: number;
  limit: number;
}): Promise<StoreProduct[]> {
  if (useFixtures) {
    const all = await fixtures.products();
    const scoped = q.categoryId
      ? productsInCategory(all, q.categoryId)
      : q.collectionId
        ? all.filter((p) => p.collection_id === q.collectionId)
        : all;
    return sliceRange(scoped, q.offset, q.limit);
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
    ...(q.collectionId ? { collection_id: q.collectionId } : {}),
  });
  return products;
}

/** Productos con precio y stock actuales por id (island de /ofertas/), en el orden de `ids`. */
export async function getPricedProductsFresh(ids: string[]): Promise<StoreProduct[]> {
  if (!ids.length) return [];
  if (useFixtures) {
    const all = await fixtures.products();
    return ids.map((id) => all.find((p) => p.id === id)).filter((p) => p !== undefined);
  }
  const byId = new Map((await fetchCards(ids)).map((p) => [p.id, p]));
  return ids.map((id) => byId.get(id)).filter((p): p is StoreProduct => Boolean(p));
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
  "items.thumbnail,items.unit_price,items.compare_at_unit_price,items.total,items.variant_id";

function cartSdk(): Medusa {
  if (useFixtures) throw new Error("El carrito no está disponible con STOREFRONT_DATA=fixtures.");
  return sdk();
}

/**
 * Crea un carrito. Con `token` (cliente con sesión, fase 9) Medusa lo asocia al cliente
 * (`customer_id` = actor del token): así sigue a la cuenta aunque no llegue al checkout.
 */
export async function createCart(
  fields = CART_COUNT_FIELDS,
  token?: string | null,
): Promise<StoreCart> {
  const region = await getRegionES();
  const { cart } = await cartSdk().store.cart.create(
    { region_id: region.id },
    { fields },
    token ? { authorization: `Bearer ${token}` } : undefined,
  );
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

// ── Búsqueda (runtime: /buscar/). Fase 7-1. ────────────────────────────────────────────────
// POST /store/search (Search Module + Meilisearch en el backend; el storefront nunca habla con
// Meilisearch). El js-sdk 2.21.2 no tiene método propio → `client.fetch`. Precio y stock NO
// salen del índice: se piden frescos para los ids de la página (≤ 24), como en las islands.

/** Lanza la búsqueda (varias consultas en una petición, ver lib/search.ts). */
export async function searchProducts(queries: SearchQueryBody[]): Promise<RawSearchResult[]> {
  if (useFixtures) throw new Error("La búsqueda no está disponible con STOREFRONT_DATA=fixtures.");
  const { results } = await sdk().client.fetch<{ results: RawSearchResult[] }>("/store/search", {
    method: "POST",
    body: { queries },
  });
  return results;
}

/**
 * Solo lo que pinta <ProductCard> (medido en dev: ~117 ms con PRICED_FIELDS → ~75 ms; lo caro
 * es `inventory_quantity`, que se mantiene: stock fresco).
 */
const CARD_FIELDS =
  "id,handle,title,subtitle,thumbnail,variants.id,variants.title,variants.manage_inventory," +
  "variants.allow_backorder,*variants.calculated_price,+variants.inventory_quantity";

async function fetchCards(ids: string[]): Promise<StoreProduct[]> {
  const region = await getRegionES();
  const { products } = await sdk().store.product.list({
    id: ids,
    limit: ids.length,
    region_id: region.id,
    country_code: COUNTRY_CODE,
    fields: CARD_FIELDS,
  });
  return products;
}

// 2000 tarjetas ≈ 2–4 MB de memoria (medido por tamaño de JSON; ver fase7.md §2.3.1).
const cardCache =
  SEARCH_CARD_CACHE_TTL > 0
    ? new CardCache<StoreProduct>({ ttlMs: SEARCH_CARD_CACHE_TTL * 1000, maxEntries: 2000 })
    : undefined;

/**
 * Productos con precio y stock por id, en el MISMO orden que `ids` (relevancia). Con
 * SEARCH_CARD_CACHE_TTL > 0, los recientes salen de la caché en memoria (lib/card-cache.ts).
 */
export async function getPricedProductsByIds(ids: string[]): Promise<StoreProduct[]> {
  if (!ids.length) return [];
  if (cardCache) return (await cardCache.getMany(ids, fetchCards, (p) => p.id)).values;
  const byId = new Map((await fetchCards(ids)).map((p) => [p.id, p]));
  return ids.map((id) => byId.get(id)).filter((p): p is StoreProduct => Boolean(p));
}

// ── Cuenta de cliente (runtime: /cuenta/*, checkout). Fase 9. ──────────────────────────────
// Flujo con verificación obligatoria (Medusa ≥ 2.16, `authVerificationsPerActor.customer`;
// context7 /medusajs/medusa storefront-development/customers/verify-account), probado contra
// 2.21.2: register → login devuelve { verification_required, token } → /auth/verification/request
// con ese token (Bearer) → email → /auth/verification/confirm { code } → login (token con
// actor_id vacío) → POST /store/customers con ese token → login de nuevo (token con actor_id).
// Las rutas /auth/* se llaman con `client.fetch` (sin el almacenamiento de tokens del SDK) y el
// token SIEMPRE se pasa por petición: la instancia del SDK es compartida entre usuarios.

export type StoreCustomer = HttpTypes.StoreCustomer;
export type StoreCustomerAddress = HttpTypes.StoreCustomerAddress;
export type CustomerAddressInput = HttpTypes.StoreCreateCustomerAddress;

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

export type LoginResult = { type: "token"; token: string } | { type: "verify"; token: string };

/** Crea la identidad email+contraseña. Lanza FetchError (401 "Identity with email already exists"). */
export async function registerIdentity(email: string, password: string): Promise<void> {
  await cartSdk().client.fetch<{ token: string }>("/auth/customer/emailpass/register", {
    method: "POST",
    body: { email, password },
  });
}

/** Inicia sesión. 401 si las credenciales no valen (mismo mensaje exista o no la cuenta). */
export async function loginCustomer(email: string, password: string): Promise<LoginResult> {
  const res = await cartSdk().client.fetch<{ token?: string; verification_required?: boolean }>(
    "/auth/customer/emailpass",
    { method: "POST", body: { email, password } },
  );
  if (!res.token) throw new Error("Respuesta de login inesperada");
  return res.verification_required
    ? { type: "verify", token: res.token }
    : { type: "token", token: res.token };
}

/** Pide el email de verificación (el token es el "sin actor" que devuelve el login). */
export async function requestEmailVerification(token: string, email: string): Promise<void> {
  await cartSdk().client.fetch("/auth/verification/request", {
    method: "POST",
    headers: bearer(token),
    body: { entity_id: email, entity_type: "email" },
  });
}

/** Confirma el código del enlace. 400 si no vale o ya se usó. */
export async function confirmEmailVerification(code: string): Promise<void> {
  await cartSdk().client.fetch("/auth/verification/confirm", {
    method: "POST",
    body: { code },
  });
}

/** Crea el cliente asociado a la identidad (primer login tras verificar). */
export async function createCustomer(token: string, email: string): Promise<void> {
  await cartSdk().store.customer.create({ email }, { fields: "id" }, bearer(token));
}

/**
 * Pide el email de restablecer contraseña. Medusa responde 201 "Created" (texto, no JSON) exista o
 * no la cuenta: `auth.resetPassword` del SDK ya pide `accept: text/plain`.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  await cartSdk().auth.resetPassword("customer", "emailpass", { identifier: email });
}

/** Cambia la contraseña con el token (de un solo uso) del enlace de restablecer. */
export async function resetPassword(token: string, password: string): Promise<void> {
  await cartSdk().client.fetch("/auth/customer/emailpass/update", {
    method: "POST",
    headers: bearer(token),
    body: { password },
  });
}

const CUSTOMER_FIELDS = "id,email,first_name,last_name,phone,has_account,*addresses";

export async function retrieveCustomer(token: string): Promise<StoreCustomer> {
  const { customer } = await cartSdk().store.customer.retrieve(
    { fields: CUSTOMER_FIELDS },
    bearer(token),
  );
  return customer;
}

export async function updateCustomer(
  token: string,
  body: { first_name: string; last_name: string; phone: string | null },
): Promise<void> {
  await cartSdk().store.customer.update(body, { fields: "id" }, bearer(token));
}

export async function createAddress(token: string, body: CustomerAddressInput): Promise<void> {
  await cartSdk().store.customer.createAddress(body, { fields: "id" }, bearer(token));
}

export async function updateAddress(
  token: string,
  addressId: string,
  body: Partial<CustomerAddressInput>,
): Promise<void> {
  await cartSdk().store.customer.updateAddress(addressId, body, { fields: "id" }, bearer(token));
}

export async function deleteAddress(token: string, addressId: string): Promise<void> {
  await cartSdk().store.customer.deleteAddress(addressId, bearer(token));
}

/**
 * Último carrito sin completar y con artículos del cliente (ruta propia del backend, fase 9), o
 * null. Sirve para que el carrito "siga" al cliente entre dispositivos.
 */
export async function latestCustomerCartId(token: string): Promise<string | null> {
  const { cart_id } = await cartSdk().client.fetch<{ cart_id: string | null }>(
    "/store/customers/me/carts",
    { headers: bearer(token) },
  );
  return cart_id;
}

/** Asocia el carrito al cliente (refresca precios). Si ya es suyo, Medusa no cambia nada. */
export async function transferCart(token: string, cartId: string): Promise<void> {
  await cartSdk().store.cart.transferCart(cartId, { fields: "id" }, bearer(token));
}

const ORDER_LIST_FIELDS =
  "id,display_id,status,created_at,currency_code,total,payment_status,fulfillment_status," +
  "items.id,items.quantity";

/** Pedidos del cliente (Medusa filtra por el `actor_id` del token), del más reciente al más antiguo. */
export async function listCustomerOrders(
  token: string,
  page: { limit: number; offset: number },
): Promise<{ orders: StoreOrder[]; count: number }> {
  const { orders, count } = await cartSdk().store.order.list(
    { ...page, fields: ORDER_LIST_FIELDS, order: "-created_at" },
    bearer(token),
  );
  return { orders, count };
}

export const ACCOUNT_ORDER_FIELDS =
  `${ORDER_FIELDS},customer_id,status,fulfillment_status,*billing_address,` +
  "items.thumbnail,items.product_handle";

/**
 * Pedido del cliente. GET /store/orders/:id NO comprueba el dueño en Medusa 2.21.2: se pide el
 * `customer_id` y la página lo compara con el del token.
 */
export async function retrieveCustomerOrder(id: string): Promise<StoreOrder> {
  const { order } = await cartSdk().store.order.retrieve(id, { fields: ACCOUNT_ORDER_FIELDS });
  return order;
}

/** Solicitud de baja (ruta propia del backend, fase 9). */
export async function requestAccountDeletion(token: string, reason: string): Promise<void> {
  await cartSdk().client.fetch("/store/customers/me/deletion-request", {
    method: "POST",
    headers: bearer(token),
    body: reason ? { reason } : {},
  });
}
