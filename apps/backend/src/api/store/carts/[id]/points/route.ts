import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { z } from "@medusajs/framework/zod";
import { MedusaError } from "@medusajs/framework/utils";
import { cartPoints } from "../../../../../lib/points-cart";
import { applyPointsWorkflow, removePointsWorkflow } from "../../../../../workflows/points";

/**
 * POST /store/carts/:id/points `{ amount }` (Fase L-2): usa puntos en el carrito (promoción de
 * un uso; sustituye la anterior). Tope: saldo y ≥ 0,50 € por pagar. → `{ amount }`.
 * DELETE: quita los puntos. Requiere sesión de cliente (middlewares.ts) y que el carrito sea suyo.
 */
export const StoreApplyPointsBody = z.object({
  amount: z.number().positive().max(100_000),
});

/**
 * GET (Fase L-3): `{ earn, applied, balance, max }` para el checkout. Sesión OPCIONAL: sin ella
 * (o si el carrito no es suyo) solo `earn` («con una cuenta ganarías…»); balance/max = null.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const result = await cartPoints(
    req.scope,
    req.params.id ?? "",
    req.auth_context?.actor_id || null,
  );
  if (!result) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Carrito no encontrado");
  res.json(result);
}

export async function POST(
  req: AuthenticatedMedusaRequest<z.infer<typeof StoreApplyPointsBody>>,
  res: MedusaResponse,
) {
  const { result } = await applyPointsWorkflow(req.scope).run({
    input: {
      cart_id: req.params.id ?? "",
      customer_id: req.auth_context.actor_id,
      amount: req.validatedBody.amount,
    },
  });
  res.json({ amount: result.amount });
}

export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await removePointsWorkflow(req.scope).run({
    input: { cart_id: req.params.id ?? "", customer_id: req.auth_context.actor_id },
  });
  res.json({ removed: true });
}
