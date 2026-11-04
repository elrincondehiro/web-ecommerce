import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { z } from "@medusajs/framework/zod";
import { COMMS_TOPIC_IDS, type CommsTopicId } from "../../../../../lib/comms";
import { consentStates } from "../../../../../lib/comms-plan";
import { COMMS_MODULE } from "../../../../../modules/comms";
import type CommsModuleService from "../../../../../modules/comms/service";
import { setCommsConsentsWorkflow } from "../../../../../workflows/comms";

/**
 * Comunicaciones del cliente (Fase MK-A). La sesión la exige Medusa (`/store/customers/me*`).
 * GET → `{ topics: [{ id, granted, granted_at }] }` (todos los temas, en orden).
 * POST `{ topics: [...] }` → los elegidos quedan activos y el resto se quita.
 */
export const StoreCommsBody = z.object({
  topics: z.array(z.enum(COMMS_TOPIC_IDS as [CommsTopicId, ...CommsTopicId[]])).max(20),
});

async function states(req: AuthenticatedMedusaRequest) {
  const active = await req.scope
    .resolve<CommsModuleService>(COMMS_MODULE)
    .listCommsConsents({ customer_id: req.auth_context.actor_id, revoked_at: null });
  return { topics: consentStates(active) };
}

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.json(await states(req));
}

export async function POST(
  req: AuthenticatedMedusaRequest<z.infer<typeof StoreCommsBody>>,
  res: MedusaResponse,
) {
  await setCommsConsentsWorkflow(req.scope).run({
    input: {
      customer_id: req.auth_context.actor_id,
      topics: [...new Set(req.validatedBody.topics)],
    },
  });
  res.json(await states(req));
}
