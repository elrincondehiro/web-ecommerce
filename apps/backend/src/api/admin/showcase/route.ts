import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { PET_SHOWCASE_STATUS, type PetShowcaseStatus } from "../../../lib/pets";
import { adminShowcase } from "../../../lib/pets-showcase";

/** GET /admin/showcase?status=pendiente (Fase MK-D): moderación del escaparate. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const raw = String(req.query.status ?? "pendiente");
  const status = (PET_SHOWCASE_STATUS as readonly string[]).includes(raw)
    ? (raw as PetShowcaseStatus)
    : "pendiente";
  res.json({ pets: await adminShowcase(req.scope, status) });
}
