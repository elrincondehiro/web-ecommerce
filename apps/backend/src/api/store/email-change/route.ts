import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { z } from "@medusajs/framework/zod";
import { confirmEmailChangeWorkflow } from "../../../workflows/email-change";

/**
 * POST /store/email-change (fase 13 punto 8) → `{ email }`: confirma el cambio de email con el
 * token del enlace enviado al email nuevo (sin sesión: el token demuestra que lo recibió). Token
 * no válido, usado o caducado, o email ocupado entretanto → 400. Se confirma con un POST desde la
 * página `/cuenta/email/`, nunca al abrir el enlace (AGENTS §3.2).
 */
export const StoreEmailChangeConfirmBody = z.object({
  token: z.string().min(10).max(200),
});

export async function POST(
  req: MedusaRequest<z.infer<typeof StoreEmailChangeConfirmBody>>,
  res: MedusaResponse,
) {
  const { result } = await confirmEmailChangeWorkflow(req.scope).run({
    input: { token: req.validatedBody.token },
  });
  res.set("Cache-Control", "private, no-store");
  res.json(result);
}
