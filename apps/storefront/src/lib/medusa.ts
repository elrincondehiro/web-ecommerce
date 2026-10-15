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
import { isDiscontinued, type StoreProduct, type StoreVariant } from "./catalog";
import { isCorrea, maxLength } from "./correa";
import type { CartPoints, PointsSummary } from "./points";
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
// `updated_at`: `lastmod` del sitemap (Fase E).
const CATALOG_FIELDS =
  "id,handle,title,subtitle,description,thumbnail,collection_id,metadata,updated_at,*images,*categories,*options,*options.values,*tags";
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

/**
 * TODAS las categorías (lista plana con `parent_category_id`; Fase S). El árbol lo arma
 * lib/categories.ts y el de la tienda (sin las vacías) lib/shop-tree.ts. La Store API ya filtra
 * `is_active` / `is_internal` (@medusajs/medusa 2.21.2, product-categories/helpers.js).
 */
export async function getCategoryList(): Promise<StoreCategory[]> {
  if (useFixtures) return fixtures.categories();
  const out: StoreCategory[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { product_categories, count } = await sdk().store.category.list({
      limit: PAGE,
      offset,
      fields: CATEGORY_FIELDS,
    });
    out.push(...product_categories);
    if (out.length >= count || product_categories.length === 0) break;
  }
  return out;
}

/**
 * Todo el catálogo con precio y stock (build, getStaticPaths). Paginado contra la API. Incluye
 * los descatalogados (Fase E): solo para las fichas; los listados usan `getListedProducts`.
 */
export function getAllProducts(): Promise<StoreProduct[]> {
  return (catalogPromise ??= loadCatalog());
}

/** Catálogo de los LISTADOS (categorías, /productos/, ofertas, home, sitemap): sin descatalogados. */
export async function getListedProducts(): Promise<StoreProduct[]> {
  return (await getAllProducts()).filter((p) => !isDiscontinued(p));
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
  return (await getListedProducts()).filter((p) => p.collection_id === collectionId);
}

/**
 * Ids de productos en oferta (Price List `sale` vigente en la región), por título. Ruta propia
 * del backend `GET /store/ofertas` (la Store API no filtra por Price List; D5 = A).
 */
export function getSaleProductIds(): Promise<string[]> {
  // Memo de módulo (como el catálogo): /ofertas/, el manifiesto de listados (listados/paginas.json) y la home
  // ven la MISMA lista aunque una oferta cambie a mitad del build. Solo build y `astro dev`: en
  // producción la island de los listados lee el manifiesto (lib/listing-pages.ts).
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
  const [ids, all] = await Promise.all([getSaleProductIds(), getListedProducts()]);
  const set = new Set(ids);
  // Correas a medida (E-2c): el configurador no admite ofertas por variante (lib/correa.ts).
  return all.filter((p) => set.has(p.id) && !isCorrea(p));
}

/**
 * Campos de la island de LiveSync (perf L-1): solo lo que usa `getProductPricing`. `*variants`
 * y no `variants.id,…` porque el granel y el €/kg leen `variants.metadata`, que la Store API
 * 2.21.2 no admite suelto (ver CARD_FIELDS). Sin título, imagen, categorías ni opciones.
 * `metadata` (E-2c): la ficha de una correa a medida manda además los datos del configurador.
 * Medido en dev (24 productos, 144 variantes): 202 → 141 KB de JSON entre servidores; el tiempo
 * lo marca `inventory_quantity` (~93 ms), que se mantiene: es el stock fresco.
 */
const LIVE_FIELDS = "id,metadata,*variants,*variants.calculated_price,+variants.inventory_quantity";

async function fetchLive(ids: string[]): Promise<StoreProduct[]> {
  const region = await getRegionES();
  const { products } = await sdk().store.product.list({
    id: ids,
    limit: ids.length,
    region_id: region.id,
    country_code: COUNTRY_CODE,
    fields: LIVE_FIELDS,
  });
  return products;
}

/** Productos con precio y stock actuales por id (island de los listados), en el orden de `ids`. */
export async function getPricedProductsFresh(ids: string[]): Promise<StoreProduct[]> {
  if (!ids.length) return [];
  if (useFixtures) {
    const all = await fixtures.products();
    return ids.map((id) => all.find((p) => p.id === id)).filter((p) => p !== undefined);
  }
  const byId = new Map((await fetchLive(ids)).map((p) => [p.id, p]));
  return ids.map((id) => byId.get(id)).filter((p): p is StoreProduct => Boolean(p));
}

/**
 * Variantes por id con precio y stock actuales (correa a medida, E-2c: las tarjetas del grupo
 * usan solo las del largo más corto de cada color, lib/correa-server.ts). `GET
 * /store/product-variants`: mucho más barato que pedir los productos con sus 117 variantes.
 */
export async function getVariantsFresh(ids: string[]): Promise<StoreVariant[]> {
  if (!ids.length) return [];
  if (useFixtures) {
    const set = new Set(ids);
    return (await fixtures.products()).flatMap((p) =>
      (p.variants ?? []).filter((v) => set.has(v.id)),
    );
  }
  const region = await getRegionES();
  const { variants } = await sdk().client.fetch<{ variants: StoreVariant[] }>(
    "/store/product-variants",
    {
      query: {
        id: ids,
        limit: ids.length,
        region_id: region.id,
        country_code: COUNTRY_CODE,
        fields:
          "id,product_id,manage_inventory,allow_backorder,*calculated_price,+inventory_quantity",
      },
    },
  );
  return variants;
}

/**
 * Disponibilidad de las correas a medida (backend E-2b: `GET /store/correas/disponibilidad`): por
 * handle, el largo más largo que se puede pedir (0 = agotada). Solo indicadores, sin cantidades;
 * 939 B para 6 correas, ~70–100 ms (enlaces de kit en memoria del backend). Landing (E-2c).
 */
export async function getCorreaMaxLengths(): Promise<Record<string, number>> {
  if (useFixtures) {
    return Object.fromEntries(
      (await fixtures.products()).filter(isCorrea).map((p) => [p.handle, maxLength(p)]),
    );
  }
  const { correas } = await sdk().client.fetch<{ correas: { handle: string; max_m: number }[] }>(
    "/store/correas/disponibilidad",
  );
  return Object.fromEntries(correas.map((c) => [c.handle, c.max_m]));
}

// ── Carrito (runtime: actions, /carrito/, island del contador). Fase 4. ─────────────────────
// Importes en unidad principal y con IVA incluido (item_total, unit_price…). Ver fase4.md §3.

/**
 * Campos mínimos para contar artículos (contador de la cabecera, respuesta de las actions).
 * `*items.variant` (S-3): su metadata dice si la línea es a granel (cuenta 1, se muestra en
 * gramos; lib/bulk.ts). La Store API 2.21.2 no admite `items.variant.metadata` suelto (lo
 * descarta sin error); medido en dev: ~15 → ~18 ms.
 */
export const CART_COUNT_FIELDS =
  "id,completed_at,items.id,items.quantity,items.variant_id,items.product_title,*items.variant";
/** Campos de la página /carrito/ y del flyout. */
export const CART_FULL_FIELDS =
  "id,completed_at,currency_code,item_total,item_subtotal,item_tax_total," +
  "items.id,items.quantity,items.product_title,items.variant_title,items.product_handle," +
  "items.thumbnail,items.unit_price,items.compare_at_unit_price,items.total,items.variant_id," +
  "items.metadata,*items.variant," +
  // Puntos (L-3): líneas antes de descuentos + ajuste PTS- («Puntos −X €» en el carrito).
  "original_item_total,items.original_total,items.adjustments.code,items.adjustments.amount";

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
  /** Datos de la línea (correa a medida: observaciones y medida exacta; los valida el backend). */
  metadata?: Record<string, unknown>,
): Promise<StoreCart> {
  const { cart } = await cartSdk().store.cart.createLineItem(
    cartId,
    { variant_id: variantId, quantity, ...(metadata ? { metadata } : {}) },
    { fields: CART_COUNT_FIELDS },
  );
  return cart;
}

/**
 * Metadata de una variante (S-3: regla de granel, `paso_g` / `min_g`). Solo variantes de
 * productos publicados del canal de la publishable key (si no, 404). El js-sdk 2.21.2 no tiene
 * método para `GET /store/product-variants/:id` → `client.fetch`.
 */
export async function getVariantMetadata(id: string): Promise<Record<string, unknown> | null> {
  const { variant } = await cartSdk().client.fetch<{
    variant: { metadata?: Record<string, unknown> | null };
  }>(`/store/product-variants/${id}`, { query: { fields: "id,metadata" } });
  return variant.metadata ?? null;
}

/**
 * Variantes de un producto con su metadata (correa a medida, E-2c: la action busca la variante
 * por largo y mosquetones; nunca la manda el cliente). `GET /store/product-variants` (solo
 * productos publicados del canal de la publishable key); medido en dev: ~40 ms con 117.
 */
export async function getProductVariantsMeta(
  productId: string,
): Promise<{ id: string; metadata?: Record<string, unknown> | null }[]> {
  const { variants } = await cartSdk().client.fetch<{
    variants: { id: string; metadata?: Record<string, unknown> | null }[];
  }>("/store/product-variants", {
    query: { product_id: productId, limit: 500, fields: "id,metadata" },
  });
  return variants;
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
  "payment_collection.payment_sessions.data,discount_total";

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
  "items.id,items.quantity,items.product_title,items.variant_title,items.unit_price,items.total," +
  "items.metadata,*items.variant,original_item_total,discount_total,items.original_total," +
  // Puntos (L-3). En los PEDIDOS, Medusa 2.21.2 omite `items.adjustments.code` si se pide como
  // campo suelto (solo devuelve `amount`); con `*items.adjustments` sí llega el código.
  "*items.adjustments";

export async function retrieveOrder(id: string): Promise<StoreOrder> {
  const { order } = await cartSdk().store.order.retrieve(id, { fields: ORDER_FIELDS });
  return order;
}

/** Un producto con precio y stock por id (server island de la ficha). */
export async function getPricedProduct(id: string): Promise<StoreProduct | null> {
  if (useFixtures) return (await fixtures.products()).find((p) => p.id === id) ?? null;
  return (await fetchLive([id]))[0] ?? null;
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
 * Solo lo que pinta <ProductCard>. `*variants` (S-2) en vez de `variants.id,…`: el €/kg necesita
 * `variants.metadata` (contenido neto) y la Store API 2.21.2 no lo admite suelto (no está en
 * `allowedStoreProductExtraFields`, api/store/products/query-config.js: se descarta sin error).
 * Medido en dev con 24 productos: ~65 ms igual que antes (+25 KB de JSON entre servidores);
 * con PRICED_FIELDS eran ~117 ms. Lo caro es `inventory_quantity` (stock fresco: se mantiene).
 */
const CARD_FIELDS =
  "id,handle,title,subtitle,thumbnail,*variants,*variants.calculated_price,+variants.inventory_quantity";

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
  "items.id,items.quantity,*items.variant";

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

// ── Lista de deseos (Fase L-1): rutas propias del backend, siempre con el token del cliente. ──

export interface WishlistItem {
  id: string;
  product_id: string;
  variant_id: string | null;
  created_at: string;
}

/** Productos guardados del cliente, del más reciente al más antiguo (solo ids). */
export async function listWishlist(token: string): Promise<WishlistItem[]> {
  return (await getWishlist(token)).items;
}

/** Lista del cliente + token del enlace público si está compartida (L-1b). */
export async function getWishlist(
  token: string,
): Promise<{ items: WishlistItem[]; share_token: string | null }> {
  return cartSdk().client.fetch<{ items: WishlistItem[]; share_token: string | null }>(
    "/store/customers/me/wishlist",
    { headers: bearer(token) },
  );
}

/** Compartir la lista (L-1b): token del enlace público (el mismo si ya estaba compartida). */
export async function shareWishlist(token: string): Promise<string> {
  const { token: share } = await cartSdk().client.fetch<{ token: string }>(
    "/store/customers/me/wishlist/share",
    { method: "POST", headers: bearer(token) },
  );
  return share;
}

/** Dejar de compartir (L-1b): el enlace anterior deja de funcionar. */
export async function unshareWishlist(token: string): Promise<void> {
  await cartSdk().client.fetch("/store/customers/me/wishlist/share", {
    method: "DELETE",
    headers: bearer(token),
  });
}

/**
 * Lista compartida (L-1b, pública): solo productos y variantes; null si el enlace no existe o se
 * revocó (404 del backend).
 */
export async function getSharedWishlist(
  shareToken: string,
): Promise<{ product_id: string; variant_id: string | null }[] | null> {
  try {
    const { items } = await cartSdk().client.fetch<{
      items: { product_id: string; variant_id: string | null }[];
    }>(`/store/wishlists/${encodeURIComponent(shareToken)}`);
    return items;
  } catch (err) {
    if ((err as { status?: unknown } | null)?.status === 404) return null;
    throw err;
  }
}

/** Guarda un producto (idempotente): `created: false` si ya estaba. */
export async function addToWishlist(
  token: string,
  productId: string,
  variantId: string | null,
): Promise<{ created: boolean }> {
  return cartSdk().client.fetch<{ created: boolean }>("/store/customers/me/wishlist/items", {
    method: "POST",
    headers: bearer(token),
    body: variantId ? { product_id: productId, variant_id: variantId } : { product_id: productId },
  });
}

/** Quita un producto guardado (si no es del cliente, `deleted: false`). */
export async function removeFromWishlist(token: string, itemId: string): Promise<boolean> {
  const { deleted } = await cartSdk().client.fetch<{ deleted: boolean }>(
    `/store/customers/me/wishlist/items/${encodeURIComponent(itemId)}`,
    { method: "DELETE", headers: bearer(token) },
  );
  return deleted;
}

// ── Puntos (Fase L-3): rutas propias del backend (lib/points.ts tiene los tipos) ─────────────

/** Saldo, pendiente y movimientos del cliente (paginado). */
export async function getPointsSummary(
  token: string,
  page: { limit: number; offset: number },
): Promise<PointsSummary> {
  return cartSdk().client.fetch<PointsSummary>("/store/customers/me/points", {
    headers: bearer(token),
    query: { limit: page.limit, offset: page.offset },
  });
}

/**
 * Puntos del carrito para el checkout: lo que generaría y, con sesión y si es suyo, saldo, máximo
 * usable y lo aplicado. Sin token, solo `earn`.
 */
export async function getCartPoints(cartId: string, token: string | null): Promise<CartPoints> {
  return cartSdk().client.fetch<CartPoints>(`/store/carts/${encodeURIComponent(cartId)}/points`, {
    headers: token ? bearer(token) : {},
  });
}

/** Usa `amount` € de puntos en el carrito (sustituye lo anterior). Errores 400 con el tope. */
export async function applyCartPoints(
  token: string,
  cartId: string,
  amount: number,
): Promise<void> {
  await cartSdk().client.fetch(`/store/carts/${encodeURIComponent(cartId)}/points`, {
    method: "POST",
    headers: bearer(token),
    body: { amount },
  });
}

export async function removeCartPoints(token: string, cartId: string): Promise<void> {
  await cartSdk().client.fetch(`/store/carts/${encodeURIComponent(cartId)}/points`, {
    method: "DELETE",
    headers: bearer(token),
  });
}

const WISHLIST_PRODUCT_FIELDS =
  "id,handle,title,subtitle,thumbnail,metadata,*variants,*variants.options,*variants.calculated_price,+variants.inventory_quantity";

/**
 * Productos de la lista con precio y stock actuales (página on-demand `/cuenta/deseos/`). Solo
 * devuelve los publicados del canal de la tienda: un producto despublicado desaparece de la lista
 * (la entrada sigue en la BD y vuelve si se publica otra vez).
 */
export async function getWishlistProducts(ids: string[]): Promise<StoreProduct[]> {
  if (!ids.length) return [];
  const region = await getRegionES();
  const { products } = await cartSdk().store.product.list({
    id: ids,
    limit: ids.length,
    region_id: region.id,
    country_code: COUNTRY_CODE,
    fields: WISHLIST_PRODUCT_FIELDS,
  });
  return products;
}
