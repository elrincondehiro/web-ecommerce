import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError, Modules } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import { EMAIL_CHANGE_MESSAGES } from "../../../../../lib/email-change";
import { normalizeEmail } from "../../../../../lib/guest-orders";
import { requestEmailChangeWorkflow } from "../../../../../workflows/email-change";

/**
 * POST /store/customers/me/email (fase 13 punto 8) → 202 `{ requested: true }`: pide cambiar el
 * email de la cuenta de la sesión. Hace falta la contraseña. Con el email libre, envía un enlace
 * (24 h, un solo uso) al email NUEVO; el cambio se hace al confirmarlo
 * (`POST /store/email-change`). Contraseña mal, mismo email o email de otra cuenta → 400 con el
 * motivo (no 401: el storefront lo trataría como sesión caducada). Validación en middlewares.ts.
 */
export const StoreEmailChangeBody = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(200),
});

export async function POST(
  req: AuthenticatedMedusaRequest<z.infer<typeof StoreEmailChangeBody>>,
  res: MedusaResponse,
) {
  const { password } = req.validatedBody;
  const email = normalizeEmail(req.validatedBody.email)!;
  const auth = req.scope.resolve(Modules.AUTH);
  const identityId = req.auth_context.auth_identity_id;
  const [identity] = identityId
    ? await auth.listAuthIdentities({ id: [identityId] }, { relations: ["provider_identities"] })
    : [];
  const current = identity?.provider_identities?.find((p) => p.provider === "emailpass")?.entity_id;
  const check = current
    ? await auth.authenticate("emailpass", { body: { email: current, password } } as never)
    : null;
  if (!check?.success || check.authIdentity?.id !== identityId) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, EMAIL_CHANGE_MESSAGES.password);
  }
  if (email === current) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, EMAIL_CHANGE_MESSAGES.same);
  }
  const taken = await auth.listProviderIdentities({
    entity_id: email,
    provider: "emailpass",
  } as never);
  if (taken.length) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, EMAIL_CHANGE_MESSAGES.taken);
  }
  await requestEmailChangeWorkflow(req.scope).run({
    input: { customer_id: req.auth_context.actor_id, new_email: email },
  });
  res.status(202).json({ requested: true });
}
