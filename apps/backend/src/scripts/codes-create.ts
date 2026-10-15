import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { normalizeCode } from "../lib/codes";

/**
 * Crea (o deja como está) un código descuento sencillo desde la terminal (Fase P). Lo normal es
 * crearlos en el Admin (Promociones, guía en docs/fases/faseP-codigos.md §3); esto sirve para
 * los e2e y para pruebas rápidas. IDEMPOTENTE: si el código ya existe, no hace nada.
 *
 *   pnpm --filter backend codes:create <CODIGO> <pct|eur> <valor> [usos_total] [por_cliente]
 *
 * Ejemplo: codes:create HIRO10 pct 10   ·   codes:create BIENVENIDA eur 5 0 1
 * Siempre con IVA incluido, sobre el pedido (sin envío), repartido entre las líneas.
 */
export default async function codesCreate({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const [raw, kind, rawValue, rawLimit, rawPerCustomer] = args;
  const code = normalizeCode(raw);
  const value = Number(String(rawValue ?? "").replace(",", "."));
  const limit = Number(rawLimit ?? 0);
  const perCustomer = Number(rawPerCustomer ?? 0);
  if (
    !code ||
    (kind !== "pct" && kind !== "eur") ||
    !(value > 0) ||
    (kind === "pct" && value > 100)
  ) {
    logger.error("Uso: codes:create <CODIGO> <pct|eur> <valor> [usos_total] [por_cliente]");
    return;
  }
  const promotion = container.resolve(Modules.PROMOTION);
  const [existing] = await promotion.listPromotions({ code }, { select: ["id"] });
  if (existing) {
    logger.info(`codes:create: ${code} ya existe; nada que hacer.`);
    return;
  }
  const budget =
    limit > 0
      ? { type: "usage" as const, limit }
      : perCustomer > 0
        ? { type: "use_by_attribute" as const, limit: perCustomer, attribute: "customer_id" }
        : null;
  await promotion.createPromotions([
    {
      code,
      type: "standard",
      status: "active",
      is_automatic: false,
      is_tax_inclusive: true,
      application_method: {
        type: kind === "pct" ? "percentage" : "fixed",
        target_type: "order",
        allocation: "across",
        value,
        currency_code: "eur",
      },
      ...(budget ? { campaign: { name: code, campaign_identifier: code, budget } } : {}),
    } as never,
  ]);
  logger.info(`codes:create: ${code} creado.`);
}
