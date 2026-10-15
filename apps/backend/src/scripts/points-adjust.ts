import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { randomUUID } from "node:crypto";
import { REF } from "../lib/points";
import { pointsMovementWorkflow } from "../workflows/points";

/**
 * Ajuste manual de puntos desde la terminal (Fase L-3; el Admin tiene el mismo ajuste en la ficha
 * del cliente). También lo usan los e2e del storefront para dar saldo a un cliente de prueba.
 *
 *   pnpm --filter backend points:adjust <email|cus_…> <credit|debit> <importe> <motivo…>
 *
 * Un cargo no deja el saldo negativo. No registra el email ni el motivo en el log.
 */
export default async function pointsAdjust({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const [who, type, rawAmount, ...noteParts] = args;
  const amount = Number(String(rawAmount ?? "").replace(",", "."));
  const note = noteParts.join(" ").trim();
  if (!who || (type !== "credit" && type !== "debit") || !(amount > 0) || note.length < 3) {
    logger.error("Uso: points:adjust <email|cus_…> <credit|debit> <importe> <motivo>");
    return;
  }
  const customers = container.resolve(Modules.CUSTOMER);
  const [customer] = who.startsWith("cus_")
    ? await customers.listCustomers({ id: who }, { select: ["id"] })
    : await customers.listCustomers(
        { email: who.toLowerCase(), has_account: true },
        { select: ["id"] },
      );
  if (!customer) {
    logger.error("points:adjust: cliente no encontrado.");
    return;
  }
  const { result } = await pointsMovementWorkflow(container).run({
    input: {
      customer_id: customer.id,
      type,
      amount: Math.round(amount * 100) / 100,
      reference: REF.adjustment,
      reference_id: randomUUID(),
      note,
      // Solo un cargo se recorta al saldo (nunca negativo).
      clampToBalance: type === "debit",
      metadata: { source: "cli" },
    },
  });
  if (!result.created) {
    logger.warn("points:adjust: sin movimiento (saldo 0 para un cargo).");
    return;
  }
  logger.info(`points:adjust: ${type} de ${result.amount.toFixed(2)} € hecho (${customer.id}).`);
}
