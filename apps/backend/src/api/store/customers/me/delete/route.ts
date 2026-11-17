import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError, Modules } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import { cleanReason, isDeletePhrase } from "../../../../../lib/account-deletion";
import { deleteAccountWorkflow } from "../../../../../workflows/delete-account";

/**
 * POST /store/customers/me/delete (fase 13) → 200 `{ deleted: true }`. Elimina la cuenta de la
 * sesión (el id sale del token; Medusa exige sesión en `/store/customers/me*`). Hace falta la
 * frase escrita («eliminar mi cuenta») y la contraseña: así no se borra con un clic sin querer
 * ni con un formulario rellenado por un gestor de contraseñas. Frase o contraseña mal, o pedidos
 * en curso → 400 sin borrar nada (el mensaje dice cuál). Validación del body en src/api/middlewares.ts.
 * Fuente: context7 /medusajs/medusa (authModuleService.authenticate con emailpass).
 */
export const StoreDeleteAccountBody = z.object({
  phrase: z.string().max(100),
  password: z.string().min(1).max(200),
  reason: z.string().max(500).optional(),
});

export async function POST(
  req: AuthenticatedMedusaRequest<z.infer<typeof StoreDeleteAccountBody>>,
  res: MedusaResponse,
) {
  const body = req.validatedBody;
  if (!isDeletePhrase(body.phrase)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Escribe la frase para confirmar.");
  }
  const auth = req.scope.resolve(Modules.AUTH);
  const identityId = req.auth_context.auth_identity_id;
  const [identity] = identityId
    ? await auth.listAuthIdentities({ id: [identityId] }, { relations: ["provider_identities"] })
    : [];
  const email = identity?.provider_identities?.find((p) => p.provider === "emailpass")?.entity_id;
  const check = email
    ? await auth.authenticate("emailpass", { body: { email, password: body.password } } as never)
    : null;
  if (!check?.success || check.authIdentity?.id !== identityId) {
    // 400 y no 401: el storefront trata el 401 como sesión caducada.
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "La contraseña no es correcta.");
  }
  await deleteAccountWorkflow(req.scope).run({
    input: {
      customer_id: req.auth_context.actor_id,
      reason: cleanReason(body.reason),
      via: "cuenta",
    },
  });
  res.status(200).json({ deleted: true });
}
