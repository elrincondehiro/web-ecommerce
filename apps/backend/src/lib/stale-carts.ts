import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { deleteStaleCartsWorkflow } from "../workflows/delete-stale-carts";

/**
 * Limpieza de carritos caducados (fase 10-4). Medusa 2.21.2 no borra nunca los carritos sin
 * completar (fase9.md §7). Se borran (suave) los que cumplen TODO:
 *   - sin cliente (`customer_id` vacío): los de «invitado con email» tienen un pago de Stripe
 *     pendiente y quedan fuera por ahora (fase10.md §7);
 *   - sin completar y sin pedido enlazado;
 *   - última actividad (la del carrito o la de su línea más reciente) de hace más de
 *     `CART_CLEANUP_DAYS` días. Cambiar una línea no siempre actualiza `cart.updated_at`.
 * El storefront ya trata el 404 de un carrito borrado como caducado (borra la cookie y crea otro).
 */
export const CART_CLEANUP_DEFAULT_DAYS = 30;
export const CART_CLEANUP_DEFAULT_CRON = "0 3 * * *";
/** Tope por ejecución: lo que quede se borra en la siguiente. */
export const CART_CLEANUP_MAX_PER_RUN = 2000;
const PAGE = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

type Dateish = string | Date | null | undefined;
export type CartCandidate = {
  id: string;
  updated_at: Dateish;
  items?: ({ created_at?: Dateish; updated_at?: Dateish } | null)[] | null;
  order?: { id?: string | null } | ({ id?: string | null } | null)[] | null;
};

/** Días de `CART_CLEANUP_DAYS`: entero ≥ 1, o el valor por defecto. */
export function cleanupDays(raw: string | undefined): number {
  const n = Number(raw);
  return raw && Number.isInteger(n) && n >= 1 ? n : CART_CLEANUP_DEFAULT_DAYS;
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

/** Ids de carritos caducados, como mucho `max`, recorriendo por lotes ordenados por id. */
export async function findStaleCartIds(
  container: MedusaContainer,
  cutoff: Date,
  max = CART_CLEANUP_MAX_PER_RUN,
): Promise<string[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const ids: string[] = [];
  let after: string | null = null;
  while (ids.length < max) {
    const { data } = await query.graph({
      entity: "cart",
      fields: ["id", "updated_at", "items.created_at", "items.updated_at", "order.id"],
      filters: {
        customer_id: null,
        completed_at: null,
        updated_at: { $lt: cutoff },
        ...(after ? { id: { $gt: after } } : {}),
      },
      pagination: { take: PAGE, order: { id: "ASC" } },
    });
    const page = data as unknown as CartCandidate[];
    if (!page.length) break;
    for (const cart of page) if (isStale(cart, cutoff) && ids.length < max) ids.push(cart.id);
    if (page.length < PAGE) break;
    after = page[page.length - 1]!.id;
  }
  return ids;
}

/** Busca y borra (suave) los carritos caducados, por lotes. Devuelve cuántos. */
export async function deleteStaleCarts(
  container: MedusaContainer,
  { now = new Date(), days = cleanupDays(process.env.CART_CLEANUP_DAYS) } = {},
): Promise<{ deleted: number; cutoff: Date }> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const cutoff = cutoffDate(now, days);
  const ids = await findStaleCartIds(container, cutoff);
  for (let i = 0; i < ids.length; i += PAGE) {
    await deleteStaleCartsWorkflow(container).run({ input: { ids: ids.slice(i, i + PAGE) } });
  }
  // Solo el número: nunca ids ni datos de los carritos en los logs.
  if (ids.length) {
    logger.info(
      `[cart-cleanup] ${ids.length} carritos sin cliente borrados (inactivos desde antes de ${cutoff.toISOString()}).`,
    );
  }
  return { deleted: ids.length, cutoff };
}
