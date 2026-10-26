import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import {
  ORDER_EMAIL_FIELDS,
  orderTransferInfo,
  type OrderLike,
} from "../../../../../../../lib/emails";

/**
 * GET /store/customers/me/orders/:id/transfer (Fase PG-3) → `{ transfer }`: datos para pagar un
 * pedido del cliente con la transferencia pendiente (IBAN, titular, concepto, importe y último
 * día), o `{ transfer: null }`. La Store API no devuelve los pagos del pedido. Solo el dueño (la
 * sesión la exige Medusa en `/store/customers/me*`); otro pedido → 404. Solo lectura.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const {
    data: [order],
  } = await query.graph({
    entity: "order",
    fields: [...ORDER_EMAIL_FIELDS, "customer_id", "status"],
    filters: { id: req.params.id },
  });
  res.set("Cache-Control", "private, no-store");
  if (!order || order.customer_id !== req.auth_context.actor_id) {
    res.status(404).json({ type: "not_found", message: "Pedido no encontrado" });
    return;
  }
  const transfer =
    order.status === "canceled" ? null : orderTransferInfo(order as unknown as OrderLike);
  res.json({ transfer });
}
