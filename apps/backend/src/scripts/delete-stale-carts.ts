import type { ExecArgs } from "@medusajs/framework/types";
import { deleteStaleCarts } from "../lib/stale-carts";

/**
 * Ejecuta una vez la limpieza de carritos del job `delete-stale-carts` (fase 10-4), con
 * `CART_CLEANUP_DAYS` del entorno. `pnpm --filter backend carts:cleanup`.
 */
export default async function deleteStaleCartsScript({ container }: ExecArgs) {
  await deleteStaleCarts(container);
}
