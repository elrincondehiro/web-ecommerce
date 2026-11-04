import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { z } from "@medusajs/framework/zod";
import { CAJA_CONTENT_MAX } from "../../../../../../lib/caja";
import { orderCajaContext, orderCajas } from "../../../../../../lib/caja-data";
import { fillCajaWorkflow } from "../../../../../../workflows/caja";

/**
 * POST /admin/orders/:id/cajas/:lineId (Fase CS-3): guarda el contenido de una caja (lo rehace
 * entero). Body validado en middlewares.ts; las reglas (snacks, PVP ≥ pagado, pago capturado…)
 * las aplica el workflow `fill-caja`.
 */
export const AdminFillCajaBody = z.object({
  items: z
    .array(
      z.object({
        variant_id: z.string().min(1).max(100),
        // Unidades (hasta 20) o gramos en el granel (hasta 1000): lo afina el workflow
        quantity: z.number().int().min(1).max(CAJA_CONTENT_MAX.grams),
      }),
    )
    .min(1)
    .max(CAJA_CONTENT_MAX.lines),
});

export async function POST(
  req: AuthenticatedMedusaRequest<z.infer<typeof AdminFillCajaBody>>,
  res: MedusaResponse,
) {
  const orderId = req.params.id ?? "";
  await fillCajaWorkflow(req.scope).run({
    input: {
      order_id: orderId,
      line_item_id: req.params.lineId ?? "",
      items: req.validatedBody.items,
      actor_id: req.auth_context.actor_id,
    },
  });
  const ctx = await orderCajaContext(req.scope, orderId);
  res.json({ cajas: ctx ? await orderCajas(req.scope, ctx) : [] });
}
