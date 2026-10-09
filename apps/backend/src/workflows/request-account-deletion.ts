import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { emitEventStep, useQueryGraphStep } from "@medusajs/medusa/core-flows";

/**
 * Solicitud de baja de un cliente (fase 9). Por ahora NO borra nada: emite el evento y un
 * subscriber avisa a la tienda por email (`SHOP_NOTIFY_EMAIL`), que tramita la baja desde el
 * Admin. Automatizarlo (borrado/anonimizado con compensación) queda para más adelante.
 * Fuente: context7 /medusajs/medusa (createWorkflow, useQueryGraphStep, emitEventStep: el evento
 * se emite solo si el workflow termina bien).
 */
export const ACCOUNT_DELETION_REQUESTED = "customer.deletion_requested";

export type AccountDeletionRequestedData = {
  customer_id: string;
  requested_at: string;
  reason: string | null;
};

export const requestAccountDeletionWorkflow = createWorkflow(
  "request-account-deletion",
  (input: { customer_id: string; reason: string | null }) => {
    // Falla (404) si el cliente no existe: no se emite nada.
    useQueryGraphStep({
      entity: "customer",
      fields: ["id"],
      filters: { id: input.customer_id },
      options: { throwIfKeyNotFound: true },
    });
    const data = transform({ input }, ({ input }): AccountDeletionRequestedData => ({
      customer_id: input.customer_id,
      requested_at: new Date().toISOString(),
      reason: input.reason,
    }));
    emitEventStep({ eventName: ACCOUNT_DELETION_REQUESTED, data });
    return new WorkflowResponse(data);
  },
);
