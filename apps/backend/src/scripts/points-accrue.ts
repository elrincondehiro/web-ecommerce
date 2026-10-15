import type { ExecArgs } from "@medusajs/framework/types";
import { accruePoints } from "../lib/points-accrue";

/** Ejecuta una vez el abono del job `points-accrue` (Fase L-2). `pnpm --filter backend points:accrue`. */
export default async function pointsAccrueScript({ container }: ExecArgs) {
  await accruePoints(container);
}
