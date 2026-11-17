import type { MedusaContainer } from "@medusajs/framework/types";
import { CART_CLEANUP_DEFAULT_CRON, deleteStaleCarts } from "../lib/stale-carts";

/**
 * Cada `CART_CLEANUP_CRON` (por defecto a diario a las 3:00): borra (suave) los carritos sin
 * cliente o de invitado con email inactivos más de `CART_CLEANUP_DAYS` días (con sus sesiones de
 * pago), vacía los de clientes con cuenta tras `CART_EMPTY_DAYS` y borra los clientes sin cuenta
 * que se quedan sin nada (fase 10-4 y fase 13, lib/stale-carts.ts).
 * Los scheduled jobs solo se ejecutan en modo worker/shared.
 */
export default async function deleteStaleCartsJob(container: MedusaContainer) {
  await deleteStaleCarts(container);
}

export const config = {
  name: "delete-stale-carts",
  schedule: process.env.CART_CLEANUP_CRON || CART_CLEANUP_DEFAULT_CRON,
};
