import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { z } from "@medusajs/framework/zod";
import { CAJA_ACEPTADA, CAJA_VISIBLE } from "../../../lib/caja";
import type { CajaClientState } from "../../../lib/line-data";
import { CAJA_MODULE } from "../../../modules/caja";
import type CajaModuleService from "../../../modules/caja/service";

/**
 * GET /store/cajas?pedido=<id> (Fase CS-4): estado de las cajas de un pedido tal y como las ve
 * el cliente (`preparando` | `propuesta` | `aceptada`), para la página del pedido. Solo ids de
 * línea y estados: sin datos personales ni contenido (el contenido viene con el pedido, que la
 * página ya protege con la cookie o la sesión).
 */
export const StoreCajasQuery = z.object({ pedido: z.string().min(1).max(100) });

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { pedido } = req.validatedQuery as z.infer<typeof StoreCajasQuery>;
  const rows = await req.scope
    .resolve<CajaModuleService>(CAJA_MODULE)
    .listCajas({ order_id: pedido });
  res.json({
    cajas: rows.map((r) => ({
      line_item_id: r.line_item_id,
      estado: (CAJA_ACEPTADA.includes(r.estado)
        ? "aceptada"
        : CAJA_VISIBLE.includes(r.estado)
          ? "propuesta"
          : "preparando") satisfies CajaClientState,
    })),
  });
}
