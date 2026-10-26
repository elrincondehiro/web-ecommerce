import type { EmailLinks, OrderReceivedShopProps, ShopPet } from "emails";
import { codeDiscount } from "./codes";
import { buildOrderPlacedProps, orderPaymentMethod, type OrderLike } from "./emails";
import { paymentStatusLabel } from "./payment-method";
import { toNumber } from "./numeric";
import { petAgeLabel, SPECIES_LABEL, type PetSpecies } from "./pets";
import { pointsDiscount } from "./points";

/**
 * Aviso de pedido nuevo a la tienda (Fase M, docs/fases/faseM-mascotas.md §B): email interno
 * (`SHOP_NOTIFY_EMAIL`) y push por ntfy (`NTFY_URL` + `NTFY_ORDERS_TOPIC`). Funciones PURAS.
 * El push NO lleva datos personales (en ntfy.sh cualquiera que sepa el tema lo lee): solo nº de
 * pedido, total, artículos y el enlace al Admin (que exige sesión).
 */

const eur = (n: number, currency = "eur") =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: currency.toUpperCase() }).format(n);

type PetLike = {
  name: string;
  species: string;
  species_other?: string | null;
  breed?: string | null;
  birth_year?: number | null;
  birth_month?: number | null;
  birth_day?: number | null;
  death_year?: number | null;
  sex?: string | null;
  neutered?: string | null;
  weight_kg?: number | null;
  diet?: string | null;
  health?: string | null;
};

/** Mascotas vivas del cliente → líneas del email («Perro · Border collie · 5 años (aprox.)»). */
export function shopPets(pets: PetLike[], today = new Date()): ShopPet[] {
  return pets
    .filter((p) => p.death_year == null)
    .map((p) => {
      const species =
        p.species === "otro" && p.species_other
          ? p.species_other
          : (SPECIES_LABEL[p.species as PetSpecies] ?? p.species);
      const age = petAgeLabel(
        { year: p.birth_year ?? null, month: p.birth_month ?? null, day: p.birth_day ?? null },
        null,
        today,
      );
      const summary = [
        species,
        p.breed,
        age ? `${age} (aprox.)` : null,
        p.sex === "macho" ? "macho" : p.sex === "hembra" ? "hembra" : null,
        p.neutered === "si" ? "esterilizado/a" : p.neutered === "no" ? "sin esterilizar" : null,
        p.weight_kg != null ? `${String(p.weight_kg).replace(".", ",")} kg` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      return { name: p.name, summary, diet: p.diet ?? null, health: p.health ?? null };
    });
}

/** URL de la ficha del pedido en el Admin (`<origen del Admin>/app/orders/<id>`), o null. */
export function adminOrderUrl(backendUrl: string | undefined, orderId: string): string | null {
  if (!backendUrl || !/^https?:\/\//.test(backendUrl)) return null;
  return `${backendUrl.replace(/\/+$/, "")}/app/orders/${encodeURIComponent(orderId)}`;
}

export function buildOrderReceivedShopProps(
  order: OrderLike & { email?: string | null },
  pets: PetLike[],
  links: EmailLinks,
  adminUrl: string | null,
): OrderReceivedShopProps {
  const base = buildOrderPlacedProps(order, links);
  const items = (order.items ?? []).filter((i): i is NonNullable<typeof i> => !!i);
  const code = codeDiscount(items);
  const points = pointsDiscount(items).amount;
  const c = base.currencyCode;
  const discounts = [
    code.code && code.amount > 0 ? `Código ${code.code} −${eur(code.amount, c)}` : null,
    points > 0 ? `Puntos −${eur(points, c)}` : null,
    base.discountTotal > 0 ? `Otros −${eur(base.discountTotal, c)}` : null,
  ].filter(Boolean);
  return {
    ...links,
    displayId: base.displayId,
    createdAt: base.createdAt,
    currencyCode: c,
    // Líneas con su total real (tras descuentos).
    items: base.items.map((i, idx) => ({ ...i, total: toNumber(items[idx]?.total) })),
    total: base.total,
    shippingTotal: base.shippingTotal,
    shippingMethod: base.shippingMethod ?? null,
    discounts: discounts.length ? discounts.join(" · ") : null,
    customerEmail: order.email ?? "",
    hasAccount: Boolean(order.customer?.has_account),
    shippingAddress: base.shippingAddress ?? null,
    pets: shopPets(pets),
    adminOrderUrl: adminUrl,
    payment: paymentStatusLabel(orderPaymentMethod(order)),
  };
}

export type NtfyMessage = { url: string; headers: Record<string, string>; body: string };

/**
 * Push de ntfy (context7 /websites/ntfy_sh, «publish»: POST al tema con cabeceras `Title`,
 * `Priority`, `Tags` y `Click`; `Authorization: Bearer` si el tema está protegido). Las
 * cabeceras HTTP van en ASCII: el emoji lo pone ntfy con la etiqueta `shopping_cart`.
 * null si falta la configuración.
 */
export function ntfyOrderMessage(
  env: { url?: string; topic?: string; token?: string },
  order: {
    displayId: number | string;
    total: number;
    currencyCode: string;
    units: number;
    /** «Bizum · cobrado»… (sin datos personales). */
    payment?: string | null;
  },
  adminUrl: string | null,
): NtfyMessage | null {
  if (!env.url || !env.topic || !/^https?:\/\//.test(env.url)) return null;
  const headers: Record<string, string> = {
    Title: `Pedido nuevo n. ${order.displayId}`,
    Priority: "high",
    Tags: "shopping_cart",
  };
  if (adminUrl) headers.Click = adminUrl;
  if (env.token) headers.Authorization = `Bearer ${env.token}`;
  const items = order.units === 1 ? "1 artículo" : `${order.units} artículos`;
  return {
    url: `${env.url.replace(/\/+$/, "")}/${encodeURIComponent(env.topic)}`,
    headers,
    body: [
      `Pedido n.º ${order.displayId}`,
      eur(order.total, order.currencyCode),
      items,
      ...(order.payment ? [order.payment] : []),
    ].join(" · "),
  };
}

/** Unidades del pedido: una línea a granel cuenta como 1 (su cantidad son pasos de gramos). */
export function orderUnits(props: Pick<OrderReceivedShopProps, "items">): number {
  return props.items.reduce((n, i) => n + (i.bulk ? 1 : i.quantity), 0);
}
