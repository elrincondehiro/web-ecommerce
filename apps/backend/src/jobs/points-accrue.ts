import type { MedusaContainer } from "@medusajs/framework/types";
import { POINTS_ACCRUE_DEFAULT_CRON } from "../lib/points";
import { accruePoints } from "../lib/points-accrue";

/**
 * Cada `POINTS_ACCRUE_CRON` (por defecto a diario a las 4:00) abona los puntos de los pedidos
 * consolidados (Fase L-2: 14 días desde el último envío, sin cancelar). Solo en worker/shared.
 */
export default async function pointsAccrueJob(container: MedusaContainer) {
  await accruePoints(container);
}

export const config = {
  name: "points-accrue",
  schedule: process.env.POINTS_ACCRUE_CRON || POINTS_ACCRUE_DEFAULT_CRON,
};
