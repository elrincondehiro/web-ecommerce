import type { MedusaContainer } from "@medusajs/framework/types";
import { processCajas } from "../lib/caja-jobs";
import { CAJA_DEFAULTS } from "../lib/caja-time";

/**
 * Caja de snacks (Fase CS-4): aceptación automática a las 24 h y aviso de 48 h laborables sin
 * preparar (lib/caja-jobs.ts). Solo corre en el worker (o en modo shared, en local).
 */
export default async function cajaJob(container: MedusaContainer) {
  await processCajas(container);
}

export const config = {
  name: "caja-snacks",
  schedule: process.env.CAJA_JOBS_CRON || CAJA_DEFAULTS.cron,
};
