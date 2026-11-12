import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import type { CommsTopicId } from "../../lib/comms";
import { deleteConsentsStep, setConsentsStep } from "./steps";

/**
 * Workflows de los consentimientos de comunicaciones (Fase MK-A). Fuente: context7
 * /medusajs/medusa (createWorkflow, `transform` para construir datos en la composición).
 */

/** Guardar las casillas de «Comunicaciones» de la cuenta. */
export const setCommsConsentsWorkflow = createWorkflow(
  "set-comms-consents",
  (input: { customer_id: string; topics: CommsTopicId[] }) => {
    const data = transform({ input }, ({ input }) => ({ ...input, via: "cuenta" as const }));
    return new WorkflowResponse(setConsentsStep(data));
  },
);

/** Baja de un tema con el enlace de un email: solo quita ese tema. */
export const unsubscribeCommsWorkflow = createWorkflow(
  "unsubscribe-comms",
  (input: { customer_id: string; topic: CommsTopicId }) => {
    const data = transform({ input }, ({ input }) => ({
      customer_id: input.customer_id,
      topics: [] as CommsTopicId[],
      only: [input.topic],
      via: "baja" as const,
    }));
    return new WorkflowResponse(setConsentsStep(data));
  },
);

/** Baja de la cuenta: se borran sus consentimientos. */
export const deleteCommsConsentsWorkflow = createWorkflow(
  "delete-comms-consents",
  (input: { customer_id: string }) => new WorkflowResponse(deleteConsentsStep(input)),
);
