import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  deleteGuestCustomersWorkflow,
  deleteStaleCartsWorkflow,
  emptyStaleCartsWorkflow,
} from "../workflows/delete-stale-carts";

/**
 * Limpieza de carritos caducados (fase 10-4; fase 13 punto 4, docs/fases/fase13-cuenta.md).
 * Medusa no borra nunca los carritos sin completar. Cada día:
 *   1. Se borran (suave) los carritos sin completar ni pedido y sin actividad (la del carrito o la
 *      de su línea más reciente; cambiar una línea no siempre actualiza `cart.updated_at`) desde
 *      hace más de `CART_CLEANUP_DAYS` días, si son SIN cliente o de un cliente SIN cuenta
 *      («invitado con email», fase 13). Antes se borran sus sesiones de pago
 *      (`deletePaymentSessionsWorkflow`: cancela el PaymentIntent de Stripe); si falla, el
 *      carrito se deja para la siguiente pasada.
 *   2. Los de clientes CON cuenta no se borran (carrito entre dispositivos) pero se VACÍAN tras
 *      `CART_EMPTY_DAYS` días (90): precios y stock habrán cambiado.
 *   3. Los clientes sin cuenta que se quedan sin pedidos ni carritos se anonimizan y se borran
 *      (suave), como en la baja de la cuenta.
 * El storefront ya trata el 404 de un carrito borrado como caducado (borra la cookie y crea otro).
 */
export const CART_CLEANUP_DEFAULT_DAYS = 30;
export const CART_CLEANUP_DEFAULT_CRON = "0 3 * * *";
/** Días sin actividad tras los que se vacía el carrito de un cliente con cuenta (fase 13). */
export const CART_EMPTY_DEFAULT_DAYS = 90;
/** Tope por ejecución: lo que quede se borra en la siguiente. */
export const CART_CLEANUP_MAX_PER_RUN = 2000;
const PAGE = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

type Dateish = string | Date | null | undefined;
export type CartCandidate = {
  id: string;
  customer_id?: string | null;
  customer?: { has_account?: boolean | null } | null;
  payment_collection?: {
    payment_sessions?: ({ id: string } | null)[] | null;
  } | null;
  updated_at: Dateish;
  items?: ({ id?: string; created_at?: Dateish; updated_at?: Dateish } | null)[] | null;
  order?: { id?: string | null } | ({ id?: string | null } | null)[] | null;
};

/** Días de `CART_CLEANUP_DAYS` (u otra variable de días): entero ≥ 1, o el valor por defecto. */
export function cleanupDays(raw: string | undefined, fallback = CART_CLEANUP_DEFAULT_DAYS): number {
  const n = Number(raw);
  return raw && Number.isInteger(n) && n >= 1 ? n : fallback;
}

/** ¿Qué se hace con un carrito caducado? Sin cliente o sin cuenta: borrar; con cuenta: vaciar. */
export function cartAction(cart: CartCandidate): "delete" | "empty" {
  return cart.customer_id && cart.customer?.has_account ? "empty" : "delete";
}

/** Sesiones de pago del carrito (Stripe: hay que cancelarlas antes de borrar el carrito). */
export function paymentSessionIds(cart: CartCandidate): string[] {
  return (cart.payment_collection?.payment_sessions ?? [])
    .map((s) => s?.id)
    .filter((id): id is string => Boolean(id));
}

export function cutoffDate(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

const time = (d: Dateish): number => (d ? new Date(d).getTime() : Number.NaN);

/** Fecha (ms) de la última actividad: el carrito o su línea más reciente. */
export function lastActivity(cart: CartCandidate): number {
  let last = time(cart.updated_at);
  for (const item of cart.items ?? []) {
    for (const t of [time(item?.updated_at), time(item?.created_at)]) {
      if (!Number.isNaN(t) && !(t <= last)) last = t;
    }
  }
  return last;
}

const hasOrder = (cart: CartCandidate): boolean =>
  (Array.isArray(cart.order) ? cart.order : [cart.order]).some((o) => !!o?.id);

/** ¿Se puede borrar? Sin pedido y con la última actividad anterior al corte. */
export function isStale(cart: CartCandidate, cutoff: Date): boolean {
  const last = lastActivity(cart);
  return !hasOrder(cart) && !Number.isNaN(last) && last < cutoff.getTime();
}

const CART_FIELDS = [
  "id",
  "updated_at",
  "customer_id",
  "customer.has_account",
  "items.id",
  "items.created_at",
  "items.updated_at",
  "order.id",
  "payment_collection.payment_sessions.id",
];

/**
 * Carritos caducados, como mucho `max`, recorriendo por lotes ordenados por id. `filters` elige
 * el grupo (sin cliente, con cliente); `keep` descarta los que no tocan (p. ej. con cuenta).
 */
export async function findStaleCarts(
  container: MedusaContainer,
  cutoff: Date,
  filters: Record<string, unknown>,
  keep: (cart: CartCandidate) => boolean = () => true,
  max = CART_CLEANUP_MAX_PER_RUN,
): Promise<CartCandidate[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const found: CartCandidate[] = [];
  let after: string | null = null;
  while (found.length < max) {
    const { data } = await query.graph({
      entity: "cart",
      fields: CART_FIELDS,
      filters: {
        ...filters,
        completed_at: null,
        updated_at: { $lt: cutoff },
        ...(after ? { id: { $gt: after } } : {}),
      },
      pagination: { take: PAGE, order: { id: "ASC" } },
    });
    const page = data as unknown as CartCandidate[];
    if (!page.length) break;
    for (const cart of page) {
      if (found.length < max && isStale(cart, cutoff) && keep(cart)) found.push(cart);
    }
    if (page.length < PAGE) break;
    after = page[page.length - 1]!.id;
  }
  return found;
}

/** Ids de carritos SIN cliente caducados (fase 10-4). */
export async function findStaleCartIds(
  container: MedusaContainer,
  cutoff: Date,
  max = CART_CLEANUP_MAX_PER_RUN,
): Promise<string[]> {
  return (await findStaleCarts(container, cutoff, { customer_id: null }, undefined, max)).map(
    (c) => c.id,
  );
}

export type CleanupResult = {
  deleted: number;
  emptied: number;
  guests: number;
  skipped: number;
  cutoff: Date;
};

/** Limpieza diaria (job `delete-stale-carts`). Solo números en los logs, nunca ids ni datos. */
export async function deleteStaleCarts(
  container: MedusaContainer,
  {
    now = new Date(),
    days = cleanupDays(process.env.CART_CLEANUP_DAYS),
    emptyDays = cleanupDays(process.env.CART_EMPTY_DAYS, CART_EMPTY_DEFAULT_DAYS),
  } = {},
): Promise<CleanupResult> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const cutoff = cutoffDate(now, days);

  // 1. Sin cliente o de invitado con email: borrar (antes, sus sesiones de pago).
  const anonymous = await findStaleCarts(container, cutoff, { customer_id: null });
  const guests = await findStaleCarts(
    container,
    cutoff,
    { customer_id: { $ne: null } },
    (c) => cartAction(c) === "delete",
  );
  let deleted = 0;
  let skipped = 0;
  const all = [...anonymous, ...guests];
  for (let i = 0; i < all.length; i += PAGE) {
    const batch = all.slice(i, i + PAGE);
    const r = await removeCarts(container, batch, "delete");
    deleted += r.done;
    skipped += r.skipped;
  }

  // 2. De clientes con cuenta: vaciar tras `emptyDays`.
  const emptyCutoff = cutoffDate(now, emptyDays);
  const accounts = await findStaleCarts(
    container,
    emptyCutoff,
    { customer_id: { $ne: null } },
    (c) => cartAction(c) === "empty" && (c.items ?? []).length > 0,
  );
  let emptied = 0;
  for (let i = 0; i < accounts.length; i += PAGE) {
    const r = await removeCarts(container, accounts.slice(i, i + PAGE), "empty");
    emptied += r.done;
    skipped += r.skipped;
  }

  // 3. Clientes sin cuenta sin pedidos ni carritos.
  const guestCustomers = await deleteOrphanGuestCustomers(container, [
    ...new Set(guests.map((c) => c.customer_id!).filter(Boolean)),
  ]);

  const promos = await deleteStalePointsPromotions(container, cutoff);
  if (promos) logger.info(`[cart-cleanup] ${promos} promociones de puntos sin usar borradas.`);
  if (deleted || emptied || guestCustomers || skipped) {
    logger.info(
      `[cart-cleanup] ${deleted} carritos borrados, ${emptied} vaciados (con cuenta), ` +
        `${guestCustomers} clientes sin cuenta borrados, ${skipped} para la próxima pasada ` +
        `(inactivos desde antes de ${cutoff.toISOString()}).`,
    );
  }
  return { deleted, emptied, guests: guestCustomers, skipped, cutoff };
}

/**
 * Borra o vacía un lote: un workflow por carrito con sesiones de pago (si Stripe falla, ese
 * carrito se salta y se reintenta mañana) y uno por lote para el resto.
 */
async function removeCarts(
  container: MedusaContainer,
  carts: CartCandidate[],
  mode: "delete" | "empty",
): Promise<{ done: number; skipped: number }> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const run = (input: { carts: CartCandidate[] }) =>
    mode === "delete"
      ? deleteStaleCartsWorkflow(container).run({ input: cartsInput(input.carts) })
      : emptyStaleCartsWorkflow(container).run({ input: cartsInput(input.carts) });
  const withSessions = carts.filter((c) => paymentSessionIds(c).length);
  const plain = carts.filter((c) => !paymentSessionIds(c).length);
  let done = 0;
  let skipped = 0;
  if (plain.length) {
    await run({ carts: plain });
    done += plain.length;
  }
  for (const cart of withSessions) {
    try {
      await run({ carts: [cart] });
      done++;
    } catch (e) {
      skipped++;
      logger.warn(`[cart-cleanup] carrito para la próxima pasada: ${String(e)}`);
    }
  }
  return { done, skipped };
}

const cartsInput = (carts: CartCandidate[]) => ({
  ids: carts.map((c) => c.id),
  payment_session_ids: carts.flatMap(paymentSessionIds),
  item_ids: carts.flatMap((c) =>
    (c.items ?? []).map((i) => i?.id).filter((id): id is string => Boolean(id)),
  ),
});

/** Clientes SIN cuenta (de la lista) que ya no tienen pedidos ni carritos: anonimizar y borrar. */
export async function deleteOrphanGuestCustomers(
  container: MedusaContainer,
  customerIds: string[],
): Promise<number> {
  if (!customerIds.length) return 0;
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "customer",
    fields: ["id", "has_account", "orders.id"],
    filters: { id: customerIds, has_account: false },
  });
  const noOrders = (data as { id: string; orders?: unknown[] | null }[])
    .filter((c) => !(c.orders ?? []).filter(Boolean).length)
    .map((c) => c.id);
  if (!noOrders.length) return 0;
  const carts = await container
    .resolve(Modules.CART)
    .listCarts({ customer_id: noOrders } as never, { select: ["customer_id"] });
  const withCarts = new Set(carts.map((c) => c.customer_id));
  const ids = noOrders.filter((id) => !withCarts.has(id));
  if (ids.length) await deleteGuestCustomersWorkflow(container).run({ input: { ids } });
  return ids.length;
}

/**
 * Promociones de canje de puntos (Fase L-2, código PTS-) que ya no sirven: sin usar
 * (`budget.used` = 0) y cuyo carrito no existe, está completado (el pedido usó otra) o lleva sin
 * cambios desde antes del corte. Las usadas se conservan (están enlazadas al pedido). Borrado
 * suave (`softDeletePromotions`).
 */
export async function deleteStalePointsPromotions(
  container: MedusaContainer,
  cutoff: Date,
): Promise<number> {
  const promotionModule = container.resolve(Modules.PROMOTION);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const promos = await promotionModule.listPromotions({ code: { $like: "PTS-%" } } as never, {
    relations: ["campaign", "campaign.budget"],
    take: CART_CLEANUP_MAX_PER_RUN,
  });
  const unused = promos.filter((p) => !(Number(p.campaign?.budget?.used ?? 0) > 0));
  if (!unused.length) return 0;
  const cartIds = [
    ...new Set(
      unused
        .map((p) => (p.metadata as { cart_id?: unknown } | null)?.cart_id)
        .filter((id): id is string => typeof id === "string"),
    ),
  ];
  const { data: carts } = cartIds.length
    ? await query.graph({
        entity: "cart",
        fields: ["id", "completed_at", "updated_at"],
        filters: { id: cartIds },
      })
    : { data: [] };
  const byId = new Map(carts.map((c) => [c.id, c]));
  const stale = unused.filter((p) => {
    const cart = byId.get(String((p.metadata as { cart_id?: unknown } | null)?.cart_id));
    return !cart || cart.completed_at || new Date(cart.updated_at as Date) < cutoff;
  });
  if (stale.length) await promotionModule.softDeletePromotions(stale.map((p) => p.id));
  return stale.length;
}
