import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { CAJA_MESSAGES } from "../../../../../lib/caja";
import { orderCajaContext, orderCajas, snackOptions } from "../../../../../lib/caja-data";

/**
 * GET /admin/orders/:id/cajas (Fase CS-3, widget «Cajas de snacks»): cajas del pedido con su
 * contenido, si se pueden rellenar ya (pago capturado, sin otra edición abierta) y los snacks que
 * se pueden meter (PVP y libre en la web). Medusa protege /admin*.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const ctx = await orderCajaContext(req.scope, req.params.id ?? "");
  if (!ctx) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Pedido no encontrado.");
  const cajas = await orderCajas(req.scope, ctx);
  const blocked =
    ctx.status === "canceled"
      ? CAJA_MESSAGES.canceled
      : ctx.pending > 0.005
        ? CAJA_MESSAGES.notCaptured
        : ctx.pendingChange
          ? CAJA_MESSAGES.pendingEdit
          : null;
  const snacks =
    cajas.length && !blocked
      ? await snackOptions(req.scope, ctx.region_id, ctx.currency_code, ctx.sales_channel_id)
      : [];
  res.json({ cajas, blocked, currency_code: ctx.currency_code, snacks });
}
