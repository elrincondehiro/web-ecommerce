import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { REF } from "../lib/points";
import { POINTS_MODULE } from "../modules/points";
import type PointsModuleService from "../modules/points/service";
import { pointsMovementWorkflow } from "../workflows/points";

/**
 * Baja de la cuenta (Fase L-2, G6): el saldo de puntos se PIERDE (cargo `account_deleted` por
 * todo el saldo) y los movimientos se CONSERVAN (≥ 4 años; no se borran). La baja aún es manual
 * (fase 9): ejecutar al tramitarla, ANTES de borrar el cliente en el Admin.
 *
 *   pnpm --filter backend points:close-account <customer_id>
 */
export default async function pointsCloseAccount({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const customerId = args[0];
  if (!customerId?.startsWith("cus_")) {
    logger.error("Uso: points:close-account <customer_id> (cus_…)");
    return;
  }
  const service = container.resolve<PointsModuleService>(POINTS_MODULE);
  const account = await service.findAccount(customerId);
  const balance = account ? await service.getBalance(account.id) : 0;
  if (!(balance > 0)) {
    logger.info("points:close-account: sin saldo; nada que hacer.");
    return;
  }
  await pointsMovementWorkflow(container).run({
    input: {
      customer_id: customerId,
      type: "debit",
      amount: balance,
      reference: REF.deleted,
      reference_id: customerId,
      note: "Baja de la cuenta",
    },
  });
  logger.info(`points:close-account: saldo de ${balance.toFixed(2)} € dado de baja.`);
}
