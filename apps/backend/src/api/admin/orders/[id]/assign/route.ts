import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError, Modules } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import { AUTO_TRANSFER, normalizeEmail } from "../../../../../lib/guest-orders";
import { linkOrderToAccountWorkflow } from "../../../../../workflows/guest-orders";

/**
 * POST /admin/orders/:id/assign (fase 13 punto 7): pasa un pedido de INVITADO a una cuenta desde
 * el widget del pedido, igual que `orders:assign` (Fase G-3): sin email de aceptación, con el
 * motivo en la nota interna del historial y el pedido al email de la cuenta. Body:
 * `{ account: email | cus_…, note }`. Errores con su motivo (cuenta no encontrada → 404; pedido
 * cancelado, ya de una cuenta… → 400). Solo usuarios del Admin (Medusa protege `/admin`).
 */
export const AdminAssignOrderBody = z.object({
  account: z.string().trim().min(3).max(254),
  note: z.string().trim().min(3).max(300),
});

export async function POST(
  req: AuthenticatedMedusaRequest<z.infer<typeof AdminAssignOrderBody>>,
  res: MedusaResponse,
) {
  const { account, note } = req.validatedBody;
  const customers = req.scope.resolve(Modules.CUSTOMER);
  const [target] = account.startsWith("cus_")
    ? await customers.listCustomers({ id: account, has_account: true }, { select: ["id"] })
    : await customers.listCustomers(
        { email: normalizeEmail(account) ?? "", has_account: true },
        { select: ["id"] },
      );
  if (!target) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "No hay ninguna cuenta con ese email.");
  }
  await linkOrderToAccountWorkflow(req.scope).run({
    input: {
      order_id: req.params.id!,
      customer_id: target.id,
      reason: AUTO_TRANSFER.manual,
      internal_note: note,
    },
  });
  res.json({ order_id: req.params.id, customer_id: target.id });
}
