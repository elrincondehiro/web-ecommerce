import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { z } from "@medusajs/framework/zod";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { isAutoTransfer, maskEmail } from "../../../../lib/guest-orders";

/**
 * GET /store/order-transfers/:id?token=… (Fase G-2): lo mínimo para la página de aceptar o
 * rechazar (`/cuenta/transferir/`): nº de pedido y email ENMASCARADO de la cuenta que lo pide.
 * Sin el token correcto de una solicitud pendiente → 404 (igual que si no existe). No se usa
 * `GET /store/orders/:id`: Medusa 2.21.2 devuelve el pedido entero a quien conozca el id.
 */
export const StoreOrderTransferQuery = z.object({ token: z.string().min(1).max(200) });

type Change = {
  id: string;
  description?: string | null;
  actions?: ({ action?: string | null; details?: { token?: unknown } | null } | null)[] | null;
};

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const token = (req.validatedQuery as z.infer<typeof StoreOrderTransferQuery>).token;
  const { data: changes } = await query.graph({
    entity: "order_change",
    fields: ["id", "description", "requested_by", "actions.action", "actions.details"],
    filters: { order_id: req.params.id, change_type: "transfer", status: "requested" } as never,
  });
  const change = (changes as (Change & { requested_by?: string | null })[]).find(
    (c) =>
      // Reclamación del cliente (G-2) o «Transfer ownership» del Admin; nunca las automáticas.
      !isAutoTransfer(c.description) &&
      (c.actions ?? []).some(
        (a) => String(a?.action) === "TRANSFER_CUSTOMER" && a?.details?.token === token,
      ),
  );
  if (!change) {
    res.status(404).json({ type: "not_found", message: "Solicitud no encontrada" });
    return;
  }
  const [{ data: orders }, { data: customers }] = await Promise.all([
    query.graph({ entity: "order", fields: ["display_id"], filters: { id: req.params.id } }),
    query.graph({
      entity: "customer",
      fields: ["email"],
      filters: { id: change.requested_by ?? "" },
    }),
  ]);
  res.json({
    display_id: Number(orders[0]?.display_id) || null,
    requested_by: maskEmail((customers[0] as { email?: string } | undefined)?.email),
  });
}
