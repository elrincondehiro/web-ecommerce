import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { z } from "@medusajs/framework/zod";
import { MedusaError } from "@medusajs/framework/utils";
import { CAJA_MOTIVO_MAX, CAJA_VISIBLE, contentLine } from "../../../../lib/caja";
import { orderCajaContext, orderCajas } from "../../../../lib/caja-data";
import { tokenMatches } from "../../../../lib/caja-time";
import { CAJA_META } from "../../../../lib/line-data";
import { CAJA_MODULE } from "../../../../modules/caja";
import type CajaModuleService from "../../../../modules/caja/service";
import { answerCajaWorkflow } from "../../../../workflows/caja/respuesta";

/**
 * Caja de snacks propuesta (Fase CS-4), para la página `/caja/` del storefront. Sin sesión: quien
 * responde demuestra que es el cliente con el token del email (de un solo uso).
 * - GET ?pedido=&token= → nº de pedido, para quién es, contenido, estado y plazo. Sin el token
 *   correcto → 404 (igual que si no existe). Una caja ya respondida → 404 también (el token se
 *   borra al responder); la página lo explica.
 * - POST { pedido, token, respuesta: aceptar | rechazar, motivo } → workflow `answer-caja`.
 * No se usa `GET /store/orders/:id` (devuelve el pedido entero a quien conozca el id).
 */
export const StoreCajaQuery = z.object({
  pedido: z.string().min(1).max(100),
  token: z.string().min(1).max(200),
});
export const StoreCajaAnswerBody = StoreCajaQuery.extend({
  respuesta: z.enum(["aceptar", "rechazar"]),
  motivo: z
    .string()
    .max(CAJA_MOTIVO_MAX * 2)
    .nullish(),
});

const notFound = () =>
  new MedusaError(MedusaError.Types.NOT_FOUND, "Enlace no válido o ya respondido.");

async function find(req: MedusaRequest, orderId: string, token: string) {
  const lineId = req.params.lineId ?? "";
  const [row] = await req.scope
    .resolve<CajaModuleService>(CAJA_MODULE)
    .listCajas({ line_item_id: lineId, order_id: orderId });
  if (!row || row.estado !== "propuesta" || !tokenMatches(token, row.token_hash)) throw notFound();
  return row;
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { pedido, token } = req.validatedQuery as z.infer<typeof StoreCajaQuery>;
  const row = await find(req, pedido, token);
  const ctx = await orderCajaContext(req.scope, pedido);
  const view =
    ctx && (await orderCajas(req.scope, ctx)).find((c) => c.line_item_id === row.line_item_id);
  if (!ctx || !view || !CAJA_VISIBLE.includes(view.estado)) throw notFound();
  const line = ctx.items.find((i) => i.id === row.line_item_id);
  const { data } = await req.scope.resolve("query").graph({
    entity: "order",
    fields: ["display_id"],
    filters: { id: pedido },
  });
  res.json({
    display_id: Number(data[0]?.display_id) || null,
    name: (line?.metadata?.[CAJA_META.name] as string) || null,
    title: view.title,
    details: view.details,
    content: view.content.map(contentLine),
    vence_at: view.vence_at,
  });
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = req.validatedBody as z.infer<typeof StoreCajaAnswerBody>;
  const row = await find(req, body.pedido, body.token);
  const { result } = await answerCajaWorkflow(req.scope).run({
    input: {
      line_item_id: row.line_item_id,
      token: body.token,
      answer: body.respuesta === "aceptar" ? "aceptada" : "rechazada",
      motivo: body.motivo ?? null,
    },
  });
  res.json({ estado: result.estado });
}
