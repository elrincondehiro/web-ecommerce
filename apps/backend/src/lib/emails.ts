import {
  buildTaxBreakdown,
  type EmailAddress,
  type EmailLineItem,
  type EmailLinks,
  type OrderPlacedProps,
  type OrderShippedProps,
  type TaxableLine,
  type TrackingInfo,
} from "emails";

/**
 * Datos de Medusa → props de las plantillas de `packages/emails` (fase 8). Funciones puras para
 * poder probarlas sin BD. Los importes de Query llegan como BigNumber (o number): `toNumber`.
 * Totales de pedido: context7 /medusajs/medusa (order totals: `item_total`, `shipping_total`,
 * `tax_total`, `items.tax_lines`, `shipping_methods.tax_lines`).
 */

/** Campos que piden los subscribers de pedido (query.graph sobre `order`). */
export const ORDER_EMAIL_FIELDS = [
  "id",
  "display_id",
  "email",
  "created_at",
  "currency_code",
  "total",
  "tax_total",
  "item_total",
  "shipping_total",
  "discount_total",
  "items.id",
  "items.product_title",
  "items.variant_title",
  "items.title",
  "items.quantity",
  "items.unit_price",
  "items.total",
  "items.tax_total",
  "items.thumbnail",
  "items.tax_lines.rate",
  "shipping_methods.name",
  "shipping_methods.total",
  "shipping_methods.tax_total",
  "shipping_methods.tax_lines.rate",
  "shipping_address.first_name",
  "shipping_address.last_name",
  "shipping_address.address_1",
  "shipping_address.address_2",
  "shipping_address.postal_code",
  "shipping_address.city",
  "shipping_address.province",
  "shipping_address.country_code",
  "shipping_address.phone",
  // Cuenta del cliente (fase 9): solo si tiene cuenta se enlaza el pedido en "Mi cuenta".
  "customer.has_account",
] as const;

type Numeric = number | string | { toJSON(): unknown } | { valueOf(): unknown } | null | undefined;

export function toNumber(value: Numeric): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  const n = Number(value.valueOf());
  return Number.isFinite(n) ? n : 0;
}

type TaxLineLike = { rate?: Numeric } | null;

type ItemLike = {
  id?: string;
  product_title?: string | null;
  variant_title?: string | null;
  title?: string | null;
  quantity?: Numeric;
  unit_price?: Numeric;
  total?: Numeric;
  tax_total?: Numeric;
  thumbnail?: string | null;
  tax_lines?: TaxLineLike[] | null;
};

type ShippingMethodLike = {
  name?: string | null;
  total?: Numeric;
  tax_total?: Numeric;
  tax_lines?: TaxLineLike[] | null;
} | null;

type AddressLike = {
  first_name?: string | null;
  last_name?: string | null;
  address_1?: string | null;
  address_2?: string | null;
  postal_code?: string | null;
  city?: string | null;
  province?: string | null;
  country_code?: string | null;
  phone?: string | null;
} | null;

export type OrderLike = {
  id: string;
  display_id?: number | null;
  email?: string | null;
  created_at?: string | Date | null;
  currency_code?: string | null;
  total?: Numeric;
  tax_total?: Numeric;
  item_total?: Numeric;
  shipping_total?: Numeric;
  discount_total?: Numeric;
  items?: (ItemLike | null)[] | null;
  shipping_methods?: ShippingMethodLike[] | null;
  shipping_address?: AddressLike;
  customer?: { has_account?: boolean | null } | null;
};

const sumRates = (lines: TaxLineLike[] | null | undefined) =>
  (lines ?? []).reduce((acc, l) => acc + toNumber(l?.rate), 0);

const countryName = (code: string | null | undefined) => {
  if (!code) return "";
  try {
    return new Intl.DisplayNames(["es"], { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code.toUpperCase();
  }
};

/** Solo una variante "real": Medusa llama "Default variant"/"Única" a la de un solo modelo. */
const variantLabel = (title: string | null | undefined) =>
  !title || /^(default( variant)?|única|unica)$/i.test(title.trim()) ? null : title;

export function toEmailAddress(address: AddressLike | undefined): EmailAddress | null {
  if (!address?.address_1) return null;
  return {
    name: [address.first_name, address.last_name].filter(Boolean).join(" "),
    address1: address.address_1,
    address2: address.address_2 ?? null,
    postalCode: address.postal_code ?? "",
    city: address.city ?? "",
    province: address.province ?? null,
    country: countryName(address.country_code),
    phone: address.phone ?? null,
  };
}

export function toEmailItem(item: ItemLike, quantity?: number): EmailLineItem {
  const unitPrice = toNumber(item.unit_price);
  const fullQty = toNumber(item.quantity);
  const qty = quantity ?? fullQty;
  return {
    title: item.product_title || item.title || "Producto",
    variant: variantLabel(item.variant_title),
    quantity: qty,
    unitPrice,
    // Si es un envío parcial, proporcional; si no, el total real (con descuentos).
    total:
      quantity === undefined || fullQty === 0
        ? toNumber(item.total)
        : (toNumber(item.total) * qty) / fullQty,
    thumbnail: item.thumbnail?.startsWith("http") ? item.thumbnail : null,
  };
}

export function orderTaxLines(order: OrderLike): TaxableLine[] {
  const items = (order.items ?? []).filter((i): i is ItemLike => !!i);
  const methods = (order.shipping_methods ?? []).filter(
    (m): m is NonNullable<ShippingMethodLike> => !!m,
  );
  return [
    ...items.map((i) => ({
      rate: sumRates(i.tax_lines),
      total: toNumber(i.total),
      taxTotal: toNumber(i.tax_total),
    })),
    ...methods.map((m) => ({
      rate: sumRates(m.tax_lines),
      total: toNumber(m.total),
      taxTotal: toNumber(m.tax_total),
    })),
  ];
}

const firstName = (order: OrderLike) => order.shipping_address?.first_name?.trim() || null;

export function buildOrderPlacedProps(order: OrderLike, links: EmailLinks): OrderPlacedProps {
  const items = (order.items ?? []).filter((i): i is ItemLike => !!i);
  const method = (order.shipping_methods ?? []).find(Boolean);
  const createdAt = order.created_at
    ? new Date(order.created_at).toISOString()
    : new Date().toISOString();
  return {
    ...links,
    displayId: order.display_id ?? order.id,
    createdAt,
    customerName: firstName(order),
    currencyCode: order.currency_code ?? "eur",
    items: items.map((i) => toEmailItem(i)),
    itemTotal: toNumber(order.item_total),
    shippingTotal: toNumber(order.shipping_total),
    shippingMethod: method?.name ?? null,
    discountTotal: toNumber(order.discount_total),
    total: toNumber(order.total),
    taxTotal: toNumber(order.tax_total),
    taxBreakdown: buildTaxBreakdown(orderTaxLines(order)),
    shippingAddress: toEmailAddress(order.shipping_address),
    // Solo con cuenta (fase 9): /cuenta/pedidos/<id>/ exige sesión del dueño del pedido. Una
    // compra como invitado no lleva enlace (/pedido/<id>/ solo muestra datos con la cookie
    // `last_order`, fase 5, P7).
    orderUrl: order.customer?.has_account ? accountOrderUrl(links.storefrontUrl, order.id) : null,
  };
}

export type FulfillmentLike = {
  id: string;
  items?: ({ line_item_id?: string | null; quantity?: Numeric } | null)[] | null;
  labels?: ({ tracking_number?: string | null; tracking_url?: string | null } | null)[] | null;
};

export function buildOrderShippedProps(
  order: OrderLike,
  fulfillment: FulfillmentLike,
  links: EmailLinks,
): OrderShippedProps {
  const byId = new Map(
    (order.items ?? []).filter((i): i is ItemLike => !!i?.id).map((i) => [i.id!, i]),
  );
  const items = (fulfillment.items ?? [])
    .filter((fi) => fi?.line_item_id && byId.has(fi.line_item_id))
    .map((fi) => toEmailItem(byId.get(fi!.line_item_id!)!, toNumber(fi!.quantity)));
  const tracking: TrackingInfo[] = (fulfillment.labels ?? [])
    .filter((l) => l?.tracking_number && l.tracking_number !== "-")
    .map((l) => ({
      number: l!.tracking_number!,
      url: l!.tracking_url && /^https?:\/\//.test(l!.tracking_url) ? l!.tracking_url : null,
    }));
  return {
    ...links,
    displayId: order.display_id ?? order.id,
    customerName: firstName(order),
    currencyCode: order.currency_code ?? "eur",
    // Si el envío no trae líneas (raro), se listan todas las del pedido.
    items: items.length ? items : [...byId.values()].map((i) => toEmailItem(i)),
    tracking,
    shippingAddress: toEmailAddress(order.shipping_address),
  };
}

/** Enlaces comunes de los emails. Sin barra final. */
export function emailLinks(
  storefrontUrl: string | undefined,
  assetsUrl: string | undefined,
): EmailLinks {
  const store = (storefrontUrl || "http://localhost:4321").replace(/\/+$/, "");
  return { storefrontUrl: store, assetsUrl: (assetsUrl || store).replace(/\/+$/, "") };
}

/** Minutos de validez de un token, a partir de su `expires_at` (o 15 por defecto, Medusa). */
export function minutesUntil(
  expiresAt: string | Date | null | undefined,
  now = new Date(),
): number {
  if (!expiresAt) return 15;
  const ms = new Date(expiresAt).getTime() - now.getTime();
  return Number.isFinite(ms) && ms > 0 ? Math.max(1, Math.round(ms / 60000)) : 15;
}

/** Validez del enlace de reset de Medusa 2.21.2 (`RESET_PASSWORD_TOKEN_TTL_SECONDS` = 15 min). */
export const RESET_TTL_MINUTES = 15;

/**
 * Enlace de restablecer contraseña: cliente → storefront `/cuenta/restablecer/` (fase 9);
 * usuario del Admin → `<backend><admin.path>/reset-password?token=` (la que lee el Admin).
 */
export function resetUrl(
  actorType: string,
  token: string,
  urls: { storefrontUrl: string; backendUrl: string; adminPath: string },
): string {
  const t = encodeURIComponent(token);
  if (actorType === "customer") return `${urls.storefrontUrl}/cuenta/restablecer/?token=${t}`;
  return `${urls.backendUrl}${urls.adminPath}/reset-password?token=${t}`;
}

/** Pedido en "Mi cuenta" (fase 9). */
export function accountOrderUrl(storefrontUrl: string, orderId: string): string {
  return `${storefrontUrl}/cuenta/pedidos/${encodeURIComponent(orderId)}/`;
}

/** "Mi cuenta" (email de bienvenida, fase 9). */
export function accountUrl(storefrontUrl: string): string {
  return `${storefrontUrl}/cuenta/`;
}

/** Enlace de verificación de email: solo el código, sin el email en la URL (dato personal). */
export function verifyUrl(storefrontUrl: string, code: string): string {
  return `${storefrontUrl}/cuenta/verificar/?token=${encodeURIComponent(code)}`;
}
