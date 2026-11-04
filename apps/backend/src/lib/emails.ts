import { toNumber, type Numeric } from "./numeric";
import {
  buildTaxBreakdown,
  type EmailAddress,
  type EmailLineItem,
  type EmailLinks,
  type OrderPlacedProps,
  type OrderShippedProps,
  type TaxableLine,
  type TrackingInfo,
  type TransferInfo,
} from "emails";
import { bulkRule } from "./granel";
import { paymentMethodInfo, type PaymentLike, type PaymentMethodInfo } from "./payment-method";
import { formatDay, formatIban, lastPayDay, transferConcept, transferConfig } from "./transfer";
import {
  CAJA_CONTENT_KEY,
  cajaSummary,
  customerLines,
  isCajaContentLine,
  isCajaLine,
  lineDetails,
} from "./line-data";
import { codeDiscount } from "./codes";
import {
  accrualBase,
  consolidateDays,
  pointsDiscount,
  pointsFor,
  roundCents,
  type AccrualItem,
} from "./points";

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
  "original_item_total",
  "shipping_total",
  "discount_total",
  "items.id",
  "items.product_title",
  "items.variant_title",
  "items.title",
  "items.quantity",
  "items.unit_price",
  "items.total",
  "items.original_total",
  "items.tax_total",
  "items.thumbnail",
  // Correa a medida (E-2): medida exacta y observaciones del cliente
  "items.metadata",
  // Granel (S-3): la regla está en la variante (paso_g); sin variante, la línea va en unidades.
  "items.variant.metadata",
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
  // Puntos (Fase L-3): descuento de puntos (ajustes PTS-) y productos `genera_puntos: false`.
  "items.adjustments.code",
  "items.adjustments.amount",
  "items.product.metadata",
  // Método de pago (Fase PG): «Bizum · cobrado», «Tarjeta · pendiente de capturar»…
  "payment_collections.payments.provider_id",
  "payment_collections.payments.captured_at",
  "payment_collections.payments.data",
] as const;

// `toNumber` vive en lib/numeric.ts (Fase L-3: también lo usan las reglas de puntos, que este
// módulo importa para el email). Se reexporta por compatibilidad.
export { toNumber };

type TaxLineLike = { rate?: Numeric } | null;

type ItemLike = {
  id?: string;
  product_title?: string | null;
  variant_title?: string | null;
  title?: string | null;
  quantity?: Numeric;
  unit_price?: Numeric;
  total?: Numeric;
  original_total?: Numeric;
  tax_total?: Numeric;
  thumbnail?: string | null;
  tax_lines?: TaxLineLike[] | null;
  variant?: {
    metadata?: Record<string, unknown> | null;
    inventory_items?:
      ({ inventory_item_id?: string | null; required_quantity?: Numeric } | null)[] | null;
  } | null;
  metadata?: Record<string, unknown> | null;
  product?: { metadata?: Record<string, unknown> | null } | null;
  adjustments?: ({ code?: string | null; amount?: Numeric } | null)[] | null;
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
  original_item_total?: Numeric;
  shipping_total?: Numeric;
  discount_total?: Numeric;
  items?: (ItemLike | null)[] | null;
  shipping_methods?: ShippingMethodLike[] | null;
  shipping_address?: AddressLike;
  customer?: { has_account?: boolean | null } | null;
  payment_collections?: ({ payments?: PaymentLike[] | null } | null)[] | null;
};

/** Método del pago más reciente del pedido (Fase PG), o null. */
export function orderPaymentMethod(order: OrderLike): PaymentMethodInfo | null {
  const payments = (order.payment_collections ?? []).flatMap((c) => c?.payments ?? []);
  const valid = payments.filter(Boolean);
  return paymentMethodInfo(valid[valid.length - 1] ?? null);
}

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

/** Detalles de la línea (correa, caja de snacks): lib/line-data.ts `lineDetails`. */
export { lineDetails };

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
  const rule = bulkRule(item.variant?.metadata);
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
    // Granel (S-3): cantidad = pasos de `paso_g` → gramos y €/kg (precio de un paso × 1000 / paso)
    bulk: rule
      ? {
          grams: qty * rule.stepG,
          pricePerKg: Math.round(((unitPrice * 1000) / rule.stepG) * 100) / 100,
        }
      : null,
    ...lineText(item.metadata),
  };
}

/** Caja: resumen en una línea + el resto en pequeño; el resto de líneas, sus detalles. */
function lineText(metadata: Record<string, unknown> | null | undefined) {
  const caja = cajaSummary(metadata);
  return caja
    ? { summary: caja.summary, details: caja.emailDetails }
    : { details: lineDetails(metadata) };
}

/** «3 × Orejas» o, a granel, «150 g · Premios» (contenido de una caja, sin precio). */
function contentText(item: ItemLike, quantity: number): string {
  const rule = bulkRule(item.variant?.metadata);
  const title = [item.product_title || item.title || "Producto", variantLabel(item.variant_title)]
    .filter(Boolean)
    .join(" · ");
  return rule ? `${formatGramsEmail(quantity * rule.stepG)} · ${title}` : `${quantity} × ${title}`;
}

const formatGramsEmail = (g: number) =>
  g >= 1000 && g % 100 === 0 ? `${String(g / 1000).replace(".", ",")} kg` : `${g} g`;

/**
 * Líneas del email: el contenido de cada caja va DENTRO de su caja (`contents`), no suelto; solo
 * el de las cajas de `visible` (propuestas o aceptadas; null = todas, p. ej. el envío).
 */
function withCajas(
  items: ItemLike[],
  build: (i: ItemLike) => EmailLineItem,
  visible: ReadonlySet<string> | null = null,
): EmailLineItem[] {
  const contents = new Map<string, string[]>();
  for (const i of items) {
    const box = i.metadata?.[CAJA_CONTENT_KEY];
    if (typeof box !== "string" || (visible && !visible.has(box))) continue;
    const q = toNumber(i.quantity);
    if (q > 0) contents.set(box, [...(contents.get(box) ?? []), contentText(i, q)]);
  }
  return items
    .filter((i) => !isCajaContentLine(i.metadata))
    .map((i) => {
      const line = build(i);
      const inside = i.id && isCajaLine(i.metadata) ? contents.get(i.id) : undefined;
      return inside?.length ? { ...line, contents: inside } : line;
    });
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
  // Sin el contenido de las cajas (a 0 €; al hacer el pedido aún no existe): no suma nada
  const items = customerLines((order.items ?? []).filter((i): i is ItemLike => !!i));
  const method = (order.shipping_methods ?? []).find(Boolean);
  const pointsUsed = pointsDiscount(items).amount;
  const code = codeDiscount(items);
  const createdAt = order.created_at
    ? new Date(order.created_at).toISOString()
    : new Date().toISOString();
  return {
    ...links,
    displayId: order.display_id ?? order.id,
    createdAt,
    customerName: firstName(order),
    currencyCode: order.currency_code ?? "eur",
    // Líneas ANTES de descuentos (L-3): los descuentos y puntos se restan en su línea, así cuadra
    // «Productos − Descuentos − Puntos + Envío = Total».
    items: items.map((i) => ({
      ...toEmailItem(i),
      total: toNumber(i.original_total ?? i.total),
    })),
    // Antes de descuentos (L-3): «Productos − Descuentos − Puntos + Envío = Total».
    itemTotal: toNumber(order.original_item_total ?? order.item_total),
    shippingTotal: toNumber(order.shipping_total),
    shippingMethod: method?.name ?? null,
    // Los puntos (L-3) y el código (Fase P) van en su propia línea; «Descuentos» = el resto.
    discountTotal: Math.max(
      0,
      roundCents(toNumber(order.discount_total) - pointsUsed - code.amount),
    ),
    discountCode: code.code,
    discountCodeAmount: code.amount,
    pointsUsed,
    // Solo con cuenta: un invitado no acumula puntos (G4: informativo, no comercial).
    pointsEarned: order.customer?.has_account
      ? pointsFor(accrualBase(items as AccrualItem[]))
      : null,
    pointsDays: consolidateDays(process.env.POINTS_CONSOLIDATE_DAYS),
    total: toNumber(order.total),
    taxTotal: toNumber(order.tax_total),
    taxBreakdown: buildTaxBreakdown(orderTaxLines(order)),
    shippingAddress: toEmailAddress(order.shipping_address),
    // Solo con cuenta (fase 9): /cuenta/pedidos/<id>/ exige sesión del dueño del pedido. Una
    // compra como invitado no lleva enlace (/pedido/<id>/ solo muestra datos con la cookie
    // `last_order`, fase 5, P7).
    orderUrl: order.customer?.has_account ? accountOrderUrl(links.storefrontUrl, order.id) : null,
    paymentMethod: orderPaymentMethod(order)?.label ?? null,
    transfer: orderTransferInfo(order),
  };
}

/** Importe con el formato de los emails («44,95 €»). */
const money = (n: number, currency: string) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: currency.toUpperCase() }).format(n);

/**
 * Datos para pagar por transferencia (Fase PG-3) si el pedido la tiene pendiente y está
 * configurada (IBAN y titular); si no, null.
 */
export function orderTransferInfo(order: OrderLike): TransferInfo | null {
  const info = orderPaymentMethod(order);
  const config = transferConfig();
  if (!info?.transfer || info.captured || !config.enabled) return null;
  const created = order.created_at ? new Date(order.created_at) : new Date();
  return {
    iban: formatIban(config.iban),
    holder: config.holder,
    concept: transferConcept(order.display_id ?? order.id),
    amount: money(toNumber(order.total), order.currency_code ?? "eur"),
    lastDay: formatDay(lastPayDay(created, config.days)),
  };
}

export type FulfillmentLike = {
  id: string;
  items?:
    | ({
        line_item_id?: string | null;
        inventory_item_id?: string | null;
        quantity?: Numeric;
      } | null)[]
    | null;
  labels?: ({ tracking_number?: string | null; tracking_url?: string | null } | null)[] | null;
};

/**
 * Unidades enviadas de cada línea. Medusa crea una línea del envío por CADA PIEZA de inventario
 * de la variante (correa: cuerda, mosquetones, anilla…; granel: el artículo en gramos), con
 * `quantity = required_quantity × unidades` (core-flows 2.22.2 create-fulfillment). Se agrupa por
 * línea del pedido: unidades = piezas / required_quantity (la menor, por si acaso). Sin pieza
 * (sin inventario, como la caja), la cantidad tal cual.
 */
function shippedUnits(items: ItemLike[], fulfillment: FulfillmentLike): Map<string, number> {
  const required = new Map<string, number>();
  for (const i of items) {
    for (const link of i.variant?.inventory_items ?? []) {
      if (link?.inventory_item_id) {
        required.set(`${i.id}|${link.inventory_item_id}`, toNumber(link.required_quantity) || 1);
      }
    }
  }
  const out = new Map<string, number>();
  for (const fi of fulfillment.items ?? []) {
    if (!fi?.line_item_id) continue;
    const q = toNumber(fi.quantity);
    const r = fi.inventory_item_id
      ? (required.get(`${fi.line_item_id}|${fi.inventory_item_id}`) ?? 1)
      : 1;
    const n = Math.round((q / r) * 1000) / 1000;
    const prev = out.get(fi.line_item_id);
    out.set(fi.line_item_id, prev === undefined ? n : Math.min(prev, n));
  }
  return out;
}

export function buildOrderShippedProps(
  order: OrderLike,
  fulfillment: FulfillmentLike,
  links: EmailLinks,
): OrderShippedProps {
  const all = (order.items ?? []).filter((i): i is ItemLike => !!i?.id);
  const units = shippedUnits(all, fulfillment);
  const inShipment = all
    .filter((i) => (units.get(i.id!) ?? 0) > 0)
    .map((i) => ({ ...i, quantity: units.get(i.id!)! }));
  // Caja de snacks (Fase CS-4): al enviar, todas están aceptadas: su contenido va dentro de ella.
  // La cantidad es la enviada (envíos parciales): el total, proporcional.
  const items = withCajas(inShipment, (i) => {
    const full = all.find((o) => o.id === i.id)!;
    return toEmailItem(full, toNumber(i.quantity));
  });
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
    items: items.length ? items : withCajas(all, (i) => toEmailItem(i)),
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

/** Aceptar o rechazar una transferencia de pedido (Fase G-2): `/cuenta/transferir/`. */
export function orderTransferUrl(storefrontUrl: string, orderId: string, token: string): string {
  return (
    `${storefrontUrl}/cuenta/transferir/?pedido=${encodeURIComponent(orderId)}` +
    `&token=${encodeURIComponent(token)}`
  );
}
