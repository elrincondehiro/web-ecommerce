import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { consentStates } from "../../../../../lib/comms-plan";
import { COMMS_MODULE } from "../../../../../modules/comms";
import type CommsModuleService from "../../../../../modules/comms/service";

/**
 * GET /admin/customers/:id/comms (Fase MK-A): temas activos y el historial (para el widget del
 * Admin, de solo lectura: el cliente decide desde su cuenta). Medusa protege /admin.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const rows = await req.scope
    .resolve<CommsModuleService>(COMMS_MODULE)
    .listCommsConsents({ customer_id: req.params.id ?? "" }, { order: { granted_at: "DESC" } });
  res.json({
    topics: consentStates(rows.filter((r) => !r.revoked_at)),
    history: rows.map((r) => ({
      topic: r.topic,
      granted_at: r.granted_at,
      source: r.source,
      text_version: r.text_version,
      revoked_at: r.revoked_at,
      revoked_via: r.revoked_via,
    })),
  });
}
