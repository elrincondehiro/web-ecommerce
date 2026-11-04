import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { orderCajaContext, orderCajas } from "../../../../../../lib/caja-data";
import { proposeCajasWorkflow } from "../../../../../../workflows/caja/respuesta";

/**
 * POST /admin/orders/:id/cajas/proponer (Fase CS-4): propone al cliente TODAS las cajas preparadas
 * del pedido (un email con todas). Todas tienen que estar preparadas (o ya resueltas).
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const orderId = req.params.id ?? "";
  const ctx = await orderCajaContext(req.scope, orderId);
  if (!ctx) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Pedido no encontrado.");
  if (ctx.status === "canceled") {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "El pedido está cancelado.");
  }
  const views = await orderCajas(req.scope, ctx);
  const { result } = await proposeCajasWorkflow(req.scope).run({
    input: { order_id: orderId, line_item_ids: views.map((v) => v.line_item_id) },
  });
  res.json({ ...result, cajas: await orderCajas(req.scope, ctx) });
}
