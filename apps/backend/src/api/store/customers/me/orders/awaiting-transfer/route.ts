import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { awaitingTransfer, type OrderPaymentLike } from "../../../../../../lib/payment-method";

/**
 * GET /store/customers/me/orders/awaiting-transfer (fase 13 punto 5) → `{ order_ids }`: pedidos
 * del cliente sin cancelar pagados por transferencia y aún sin cobrar, para enseñar «Esperando
 * transferencia» en «Mis pedidos». La Store API de Medusa no devuelve los pagos del pedido
 * (`payment_collections.payments` no llega en `GET /store/orders`, Medusa 2.22.7) y
 * `payment_status` es «authorized» también con una tarjeta sin capturar. Solo los del cliente de
 * la sesión (Medusa la exige en `/store/customers/me*`). Solo lectura.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "status",
      "payment_collections.payments.provider_id",
      "payment_collections.payments.captured_at",
      "payment_collections.payments.canceled_at",
    ],
    filters: { customer_id: req.auth_context.actor_id, status: { $ne: "canceled" } } as never,
  });
  res.set("Cache-Control", "private, no-store");
  res.json({
    order_ids: (data as unknown as OrderPaymentLike[]).filter(awaitingTransfer).map((o) => o.id),
  });
}
