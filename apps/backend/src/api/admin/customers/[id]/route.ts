import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { deleteAccountWorkflow } from "../../../../workflows/delete-account";

/**
 * DELETE /admin/customers/:id (fase 13): sustituye a la ruta de Medusa (la ruta propia se
 * registra después y gana; solo cambia DELETE, GET y POST siguen siendo los de Medusa) para que
 * el botón «Eliminar» del Admin haga la misma baja que «Mi cuenta» (pedidos en curso → 400,
 * puntos, ficha anonimizada, identidad de acceso, historial de emails). Misma respuesta que la
 * de Medusa. Fuente: context7 /medusajs/medusa (RoutesLoader: la ruta registrada después
 * sustituye a la anterior); @medusajs/medusa 2.22.7 `api/admin/customers/[id]/route.js`.
 */
export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const id = req.params.id!;
  await deleteAccountWorkflow(req.scope).run({
    input: { customer_id: id, reason: null, via: "admin" },
  });
  res.status(200).json({ id, object: "customer", deleted: true });
}
