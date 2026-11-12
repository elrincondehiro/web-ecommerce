// Actions de «Comunicaciones» (Fase MK-A): guardar las casillas de la cuenta. Como el resto de la
// cuenta (src/actions/account.ts): formulario sin JS y PRG con la cookie flash (el middleware lo
// hace para `account.*`). La baja con el enlace del email NO es una action: la hace la página
// `/baja/` (tiene que aceptar el POST de un clic de los clientes de correo, RFC 8058).
import type { ActionAPIContext } from "astro:actions";
import { defineAction } from "astro:actions";
import { COMMS_PATH, isUnauthorized, loginRedirect } from "$lib/account";
import { parseCommsTopics } from "$lib/comms";
import { saveComms } from "$lib/medusa";
import type { AccountResult } from "./account";

function logError(ctx: ActionAPIContext, err: unknown): void {
  ctx.logger.error(`comunicaciones: ${err instanceof Error ? err.message : String(err)}`);
}

export const comms = {
  comms: defineAction({
    accept: "form",
    handler: async (form, ctx): Promise<AccountResult> => {
      const token = ctx.locals.customerToken;
      if (!token) return { to: loginRedirect(COMMS_PATH), flash: { code: "session_expired" } };
      try {
        await saveComms(token, parseCommsTopics(form.getAll("topic")));
        return { to: COMMS_PATH, flash: { code: "comms_saved" } };
      } catch (err) {
        if (isUnauthorized(err)) {
          return { to: loginRedirect(COMMS_PATH), flash: { code: "session_expired" } };
        }
        logError(ctx, err);
        return { to: COMMS_PATH, flash: { code: "error" } };
      }
    },
  }),
};
