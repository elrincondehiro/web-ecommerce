import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { z } from "@medusajs/framework/zod";
import { commsTopic } from "../../../../lib/comms";
import { readUnsubscribeToken } from "../../../../lib/comms-token";
import { unsubscribeCommsWorkflow } from "../../../../workflows/comms";

/**
 * Baja de un tema con el enlace de un email comercial (Fase MK-A), sin sesión: el token firmado
 * (lib/comms-token.ts) demuestra a quién y de qué. La llama la página `/baja/` del storefront,
 * tanto al pulsar el botón como en el POST de un clic del cliente de correo (RFC 8058).
 * - GET ?token= → `{ topic: { id, title } }` para enseñar «Darte de baja de X» (404 si no vale).
 * - POST { token } → quita el tema (idempotente; un cliente borrado no da error).
 */
export const StoreUnsubscribeQuery = z.object({ token: z.string().min(1).max(200) });
export const StoreUnsubscribeBody = StoreUnsubscribeQuery;

const notFound = (res: MedusaResponse) =>
  res.status(404).json({ type: "not_found", message: "Enlace de baja no válido." });

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { token } = req.validatedQuery as z.infer<typeof StoreUnsubscribeQuery>;
  const payload = readUnsubscribeToken(token);
  if (!payload) return notFound(res);
  const topic = commsTopic(payload.topic);
  res.json({ topic: { id: topic.id, title: topic.title } });
}

export async function POST(
  req: MedusaRequest<z.infer<typeof StoreUnsubscribeBody>>,
  res: MedusaResponse,
) {
  const payload = readUnsubscribeToken(req.validatedBody.token);
  if (!payload) return notFound(res);
  await unsubscribeCommsWorkflow(req.scope).run({ input: payload });
  const topic = commsTopic(payload.topic);
  res.json({ topic: { id: topic.id, title: topic.title }, unsubscribed: true });
}
