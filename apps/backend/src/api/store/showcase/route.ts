import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { publicShowcase } from "../../../lib/pets-showcase";

/**
 * GET /store/showcase (Fase MK-D): escaparate «Vuestros peques», público. Solo nombre, foto y edad
 * en texto de las mascotas con la casilla del escaparate, foto y aprobadas en el Admin.
 * `{ alive: [...], gone: [...] }`. Sin datos del dueño.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.json(await publicShowcase(req.scope));
}
