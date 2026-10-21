import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import {
  acceptOrderTransferWorkflow,
  requestOrderTransferWorkflow,
} from "@medusajs/medusa/core-flows";
import { markLinkedStep, transferTokenStep, validateLinkStep, type LinkInput } from "./steps";

/**
 * Pasa un pedido de invitado a una cuenta en el momento, sin email de aceptación (Fase G-1 y
 * G-3). Usa la transferencia oficial de Medusa (solicitud + aceptación con su token) para que
 * quede en el historial del pedido del Admin y se pueda deshacer con «transferir a invitado».
 * El pedido pasa al email de la cuenta (`update_order_email`). Si algo falla después de crear la
 * solicitud, la compensación del workflow oficial la borra (no queda el pedido bloqueado).
 * Fuentes: context7 /medusajs/medusa («order transfer», `runAsStep`); spike G-0.
 */
export const linkOrderToAccountWorkflow = createWorkflow(
  "link-guest-order-to-account",
  (input: LinkInput) => {
    validateLinkStep(input);
    const request = transform({ input }, ({ input }) => ({
      order_id: input.order_id,
      customer_id: input.customer_id,
      logged_in_user: input.customer_id,
      description: input.reason,
      ...(input.internal_note ? { internal_note: input.internal_note } : {}),
      update_order_email: true,
    }));
    requestOrderTransferWorkflow.runAsStep({ input: request });
    const token = transferTokenStep({ order_id: input.order_id });
    const accept = transform({ input, token }, ({ input, token }) => ({
      order_id: input.order_id,
      token,
    }));
    // La marca va ANTES de aceptar: cuando el pedido aparece en la cuenta ya la lleva (si la
    // aceptación falla, la compensación la quita). Después, el pedido saldría un instante sin la
    // insignia (carrera que vio el CI).
    markLinkedStep({ order_id: input.order_id, reason: input.reason });
    acceptOrderTransferWorkflow.runAsStep({ input: accept });
    return new WorkflowResponse({ order_id: input.order_id });
  },
);
