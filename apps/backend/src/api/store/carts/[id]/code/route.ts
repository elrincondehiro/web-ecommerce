import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { MedusaContainer } from "@medusajs/framework/types";
import { z } from "@medusajs/framework/zod";
import { pointsDiscount } from "../../../../../lib/points";
import { maxForRoom, pointsRoom } from "../../../../../lib/points-room";
import { applyCodeWorkflow, removeCodeWorkflow } from "../../../../../workflows/codes";
import { applyPointsWorkflow, removePointsWorkflow } from "../../../../../workflows/points";
import { POINTS_MODULE } from "../../../../../modules/points";
import type PointsModuleService from "../../../../../modules/points/service";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/**
 * Códigos descuento (Fase P). Solo con sesión de cliente con cuenta (middleware + workflow).
 * POST `{ code }` → aplica (sustituye el anterior: uno por pedido) y, si el carrito tenía puntos
 * que ya no caben (siempre ≥ 0,50 € por pagar), los RECORTA al nuevo máximo (Q2) →
 * `{ code, points_adjusted: null | importe (0 = quitados) }`. DELETE → quita el código.
 */
export const StoreApplyCodeBody = z.object({ code: z.string().min(1).max(60) });

/** Puntos aplicados en el carrito (descuento real, ajustes PTS-). */
async function appliedPoints(scope: MedusaContainer, cartId: string): Promise<number> {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "cart",
    fields: ["total", "items.adjustments.code", "items.adjustments.amount"],
    filters: { id: cartId },
  });
  return pointsDiscount((data[0] as unknown as { items?: never } | undefined)?.items).amount;
}

/** Vuelve a aplicar `wanted` € de puntos, recortados al máximo tras el código (o nada si es 0). */
async function reapplyPoints(
  scope: MedusaContainer,
  cartId: string,
  customerId: string,
  wanted: number,
): Promise<number> {
  const room = await pointsRoom(scope, cartId);
  const service = scope.resolve<PointsModuleService>(POINTS_MODULE);
  const account = await service.findAccount(customerId);
  const balance = account ? await service.getBalance(account.id) : 0;
  const amount = Math.min(wanted, room ? maxForRoom(balance, room) : 0);
  if (amount > 0) {
    await applyPointsWorkflow(scope).run({
      input: { cart_id: cartId, customer_id: customerId, amount },
    });
  }
  return amount;
}

export async function POST(
  req: AuthenticatedMedusaRequest<z.infer<typeof StoreApplyCodeBody>>,
  res: MedusaResponse,
) {
  const cartId = req.params.id ?? "";
  const customerId = req.auth_context.actor_id;
  const input = { cart_id: cartId, customer_id: customerId, code: req.validatedBody.code };
  // Con puntos, el código podría no caber (Medusa aplica antes la promoción de mayor valor, y
  // unos puntos que cubren todo dejan al código sin nada: lo descarta sin error, spike P-0). Se
  // quitan, se aplica el código y se vuelven a poner recortados al nuevo máximo (Q2). Si el código
  // falla, se restauran los puntos que había.
  const points = await appliedPoints(req.scope, cartId);
  if (points > 0) {
    await removePointsWorkflow(req.scope).run({
      input: { cart_id: cartId, customer_id: customerId },
    });
  }
  let code: string;
  try {
    ({
      result: { code },
    } = await applyCodeWorkflow(req.scope).run({ input }));
  } catch (err) {
    if (points > 0) await reapplyPoints(req.scope, cartId, customerId, points);
    throw err;
  }
  const kept = points > 0 ? await reapplyPoints(req.scope, cartId, customerId, points) : 0;
  res.json({ code, points_adjusted: points > 0 && kept < points - 0.001 ? kept : null });
}

export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { result } = await removeCodeWorkflow(req.scope).run({
    input: { cart_id: req.params.id ?? "", customer_id: req.auth_context.actor_id },
  });
  res.json({ removed: result.removed.length > 0 });
}
