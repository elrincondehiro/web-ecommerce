import type { MedusaContainer } from "@medusajs/framework/types";
import { PURGE_DEFAULT_CRON, purgeDeleted } from "../lib/purge";

/**
 * Cada `PURGE_CRON` (por defecto los domingos a las 4:00) borra DE VERDAD lo borrado en suave hace
 * más de `PURGE_DAYS` días (90): carritos, promociones de puntos sin usar y fichas de cliente
 * anonimizadas sin pedidos (fase 13, lib/purge.ts). Solo en el worker.
 */
export default async function purgeDeletedJob(container: MedusaContainer) {
  await purgeDeleted(container);
}

export const config = {
  name: "purge-deleted",
  schedule: process.env.PURGE_CRON || PURGE_DEFAULT_CRON,
};
