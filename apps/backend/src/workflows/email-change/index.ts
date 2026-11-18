import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { emitEventStep } from "@medusajs/medusa/core-flows";
import {
  emailChangeExpiry,
  hashEmailChangeToken,
  newEmailChangeToken,
} from "../../lib/email-change";
import { EMAIL_CHANGE_MODULE } from "../../modules/email-change";
import type EmailChangeModuleService from "../../modules/email-change/service";
import {
  changeCustomerEmailStep,
  changeLoginEmailStep,
  changeOrdersEmailStep,
  findEmailChangeStep,
  useEmailChangeStep,
  validateEmailChangeStep,
} from "./steps";

/**
 * Cambio de email de la cuenta (fase 13 punto 8, docs/fases/fase13-cuenta.md §2.6).
 * - `requestEmailChangeWorkflow`: la ruta ya comprobó la contraseña y que el email está libre.
 *   Anula las solicitudes anteriores del cliente, guarda la nueva (hash del token, 24 h) y emite
 *   `customer.email_change_requested` (subscriber: email al NUEVO con el enlace).
 * - `confirmEmailChangeWorkflow`: con el token del enlace cambia el email de acceso (y lo deja
 *   verificado), el del cliente y el de sus pedidos en curso; emite `customer.email_changed`
 *   (subscriber: aviso al email ANTIGUO). Todo con compensación.
 */
export const EMAIL_CHANGE_REQUESTED = "customer.email_change_requested";
export const EMAIL_CHANGED = "customer.email_changed";

export type EmailChangeRequestedData = { customer_id: string; new_email: string; token: string };
export type EmailChangedData = {
  customer_id: string;
  old_email: string;
  new_email: string;
  first_name: string | null;
};

const createEmailChangeStep = createStep(
  "create-email-change",
  async (input: { customer_id: string; new_email: string }, { container }) => {
    const svc = container.resolve<EmailChangeModuleService>(EMAIL_CHANGE_MODULE);
    const previous = await svc.listEmailChanges({
      customer_id: input.customer_id,
      used_at: null,
    } as never);
    if (previous.length) await svc.softDeleteEmailChanges(previous.map((p) => p.id));
    const token = newEmailChangeToken();
    const row = await svc.createEmailChanges({
      customer_id: input.customer_id,
      new_email: input.new_email,
      token_hash: hashEmailChangeToken(token),
      expires_at: emailChangeExpiry(new Date()),
    });
    return new StepResponse({ token }, { created: row.id, previous: previous.map((p) => p.id) });
  },
  async (prev, { container }) => {
    if (!prev) return;
    const svc = container.resolve<EmailChangeModuleService>(EMAIL_CHANGE_MODULE);
    await svc.deleteEmailChanges(prev.created);
    if (prev.previous.length) await svc.restoreEmailChanges(prev.previous);
  },
);

export const requestEmailChangeWorkflow = createWorkflow(
  "request-email-change",
  (input: { customer_id: string; new_email: string }) => {
    const { token } = createEmailChangeStep(input);
    const data = transform({ input, token }, ({ input, token }): EmailChangeRequestedData => ({
      customer_id: input.customer_id,
      new_email: input.new_email,
      token,
    }));
    emitEventStep({ eventName: EMAIL_CHANGE_REQUESTED, data });
    return new WorkflowResponse({ requested: true });
  },
);

export const confirmEmailChangeWorkflow = createWorkflow(
  "confirm-email-change",
  (input: { token: string }) => {
    const row = findEmailChangeStep(input);
    const target = validateEmailChangeStep(row);
    useEmailChangeStep(target);
    changeLoginEmailStep(target);
    changeCustomerEmailStep(target);
    changeOrdersEmailStep(target);
    const data = transform({ target }, ({ target }): EmailChangedData => ({
      customer_id: target.customer_id,
      old_email: target.old_email,
      new_email: target.new_email,
      first_name: target.first_name,
    }));
    emitEventStep({ eventName: EMAIL_CHANGED, data });
    return new WorkflowResponse({ email: target.new_email });
  },
);
