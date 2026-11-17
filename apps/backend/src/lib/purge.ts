import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { anonymizedEmail } from "./account-deletion";
import { cleanupDays, cutoffDate } from "./stale-carts";

/**
 * Purga definitiva (fase 13 punto 4, docs/fases/fase13-cuenta.md): lo borrado en SUAVE hace más
 * de `PURGE_DAYS` días (90) se borra DE VERDAD. Job semanal `purge-deleted` (worker).
 *   - Carritos (con sus líneas, envíos, ajustes e impuestos: cascada de la BD), sus direcciones y
 *     sus enlaces con cobros y promociones.
 *   - Promociones de canje de puntos (`PTS-`) sin usar (las usadas nunca se borran en suave).
 *   - Fichas de cliente ANONIMIZADAS (`borrado-<id>@invalid`: baja o limpieza) SIN pedidos ni
 *     cuenta de puntos (si los tienen, la ficha se queda: la enlazan).
 * Por lotes y con tope; solo números en el log. Los `delete*` de los módulos borran por id sin
 * mirar `deleted_at` (@medusajs/utils 2.22.7, `MedusaService.delete`); la búsqueda de lo borrado
 * es SQL de solo lectura, y las filas de enlace de los carritos se borran por SQL (abajo).
 */
export const PURGE_DEFAULT_DAYS = 90;
export const PURGE_DEFAULT_CRON = "0 4 * * 0";
const PAGE = 200;
const MAX = 5000;

export type PurgeResult = { carts: number; promotions: number; customers: number; cutoff: Date };

const knex = (c: MedusaContainer) => c.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);

/** Ids de una tabla con `deleted_at` anterior al corte. */
async function deletedBefore(
  container: MedusaContainer,
  table: string,
  cutoff: Date,
  extra: (q: Knex.QueryBuilder) => void = () => {},
): Promise<string[]> {
  const rows: { id: string }[] = await knex(container)(table)
    .select("id")
    .whereNotNull("deleted_at")
    .andWhere("deleted_at", "<", cutoff)
    .modify(extra)
    .orderBy("id")
    .limit(MAX);
  return rows.map((r) => r.id);
}

export async function purgeDeleted(
  container: MedusaContainer,
  { now = new Date(), days = cleanupDays(process.env.PURGE_DAYS, PURGE_DEFAULT_DAYS) } = {},
): Promise<PurgeResult> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const cutoff = cutoffDate(now, days);
  const db = knex(container);

  // Carritos: primero los enlaces (cobro, promociones), luego el carrito y sus direcciones.
  const cartModule = container.resolve(Modules.CART);
  const cartIds = await deletedBefore(container, "cart", cutoff);
  for (let i = 0; i < cartIds.length; i += PAGE) {
    const ids = cartIds.slice(i, i + PAGE);
    const rows: { shipping_address_id: string | null; billing_address_id: string | null }[] =
      await db("cart").select("shipping_address_id", "billing_address_id").whereIn("id", ids);
    const addressIds = [
      ...new Set(rows.flatMap((r) => [r.shipping_address_id, r.billing_address_id])),
    ].filter((a): a is string => Boolean(a));
    await dismissCartLinks(container, ids);
    await cartModule.deleteCarts(ids);
    if (addressIds.length) await cartModule.deleteAddresses(addressIds);
  }

  // Promociones de puntos sin usar (las borra en suave la limpieza diaria).
  const promotionModule = container.resolve(Modules.PROMOTION);
  const promoIds = await deletedBefore(container, "promotion", cutoff, (q) => {
    void q.where("code", "like", "PTS-%");
  });
  for (let i = 0; i < promoIds.length; i += PAGE) {
    await promotionModule.deletePromotions(promoIds.slice(i, i + PAGE));
  }

  // Fichas anonimizadas sin pedidos ni cuenta de puntos.
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const customerModule = container.resolve(Modules.CUSTOMER);
  const customerIds = await deletedBefore(container, "customer", cutoff, (q) => {
    void q.where("email", "like", "borrado-%@invalid");
  });
  let customers = 0;
  for (let i = 0; i < customerIds.length; i += PAGE) {
    const ids = customerIds.slice(i, i + PAGE);
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["customer_id"],
      filters: { customer_id: ids },
    });
    const points: { customer_id: string }[] = await db("points_account")
      .select("customer_id")
      .whereIn("customer_id", ids);
    const keep = new Set([
      ...orders.map((o) => o.customer_id),
      ...points.map((p) => p.customer_id),
    ]);
    const emails: { id: string; email: string }[] = await db("customer")
      .select("id", "email")
      .whereIn(
        "id",
        ids.filter((id) => !keep.has(id)),
      );
    // Solo las anonimizadas de verdad (el email exacto de su id).
    const purge = emails.filter((c) => c.email === anonymizedEmail(c.id)).map((c) => c.id);
    if (purge.length) await customerModule.deleteCustomers(purge);
    customers += purge.length;
  }

  if (cartIds.length || promoIds.length || customers) {
    logger.info(
      `[purge] ${cartIds.length} carritos, ${promoIds.length} promociones de puntos y ` +
        `${customers} fichas de cliente borrados definitivamente (borrados antes de ` +
        `${cutoff.toISOString()}).`,
    );
  }
  return { carts: cartIds.length, promotions: promoIds.length, customers, cutoff };
}

/**
 * Borra (de verdad) las filas de enlace carrito ↔ cobro y carrito ↔ promoción de esos carritos.
 * Ya están borradas en suave (la limpieza usa `removeRemoteLinkStep`) y `link.dismiss` también
 * es suave (@medusajs/link-modules 2.22.7), así que van por SQL: son tablas de enlace sin lógica
 * ni eventos, y solo filas de carritos que se borran a continuación.
 */
async function dismissCartLinks(container: MedusaContainer, ids: string[]): Promise<void> {
  const db = knex(container);
  await db("cart_payment_collection").whereIn("cart_id", ids).delete();
  await db("cart_promotion").whereIn("cart_id", ids).delete();
}
