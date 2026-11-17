import type { ExecArgs } from "@medusajs/framework/types";
import { purgeDeleted } from "../lib/purge";

/**
 * Ejecuta una vez la purga del job `purge-deleted` (fase 13), con `PURGE_DAYS` del entorno.
 * `pnpm --filter backend purge:deleted`.
 */
export default async function purgeDeletedScript({ container }: ExecArgs) {
  await purgeDeleted(container);
}
