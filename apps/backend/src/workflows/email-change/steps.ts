import type { ICustomerModuleService, MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { updateOrderWorkflow } from "@medusajs/medusa/core-flows";
import type { OrderForDeletion } from "../../lib/account-deletion";
import {
  changesOrderEmail,
  EMAIL_CHANGE_MESSAGES,
  emailChangeTokenMatches,
  emailChangeUsable,
} from "../../lib/email-change";
import { EMAIL_CHANGE_MODULE } from "../../modules/email-change";
import type EmailChangeModuleService from "../../modules/email-change/service";

/**
 * Pasos del cambio de email (fase 13 punto 8). Los que escriben tienen compensación.
 * Fuentes: context7 /medusajs/medusa (createStep con compensación; Auth Module:
 * `updateProviderIdentities`, `entity_id` = email en emailpass; verificación de emails por
 * `auth_verification`); código de @medusajs/medusa 2.22.7 (`validate-verification`: el login
 * exige una verificación con `verified_at` para el `entity_id` actual) y core-flows
 * (`updateOrderWorkflow`: email del pedido con su `order_change`).
 */

const svc = (c: unknown) =>
  (c as MedusaContainer).resolve<EmailChangeModuleService>(EMAIL_CHANGE_MODULE);
/**
 * El servicio del Auth Module es un `MedusaService` con el modelo `AuthVerification`
 * (@medusajs/auth 2.22.7, `auth-module.js`): tiene `create/deleteAuthVerifications` aunque
 * `IAuthModuleService` no los declare.
 */
type AuthWithVerifications = {
  createAuthVerifications(d: Record<string, unknown>[]): Promise<{ id: string }[]>;
  updateAuthVerifications(d: Record<string, unknown>[]): Promise<unknown>;
  deleteAuthVerifications(ids: string[]): Promise<void>;
};
const customers = (c: unknown) =>
  (c as MedusaContainer).resolve<ICustomerModuleService>(Modules.CUSTOMER);

type Row = {
  id: string;
  customer_id: string;
  new_email: string;
  token_hash: string;
  expires_at: Date | string;
  used_at?: Date | string | null;
};

/** La solicitud del token, sin usar ni caducar (si no → 400 con el mismo mensaje siempre). */
export const findEmailChangeStep = createStep(
  "find-email-change",
  async (input: { token: string }, { container }) => {
    const rows = (await svc(container).listEmailChanges({
      used_at: null,
    } as never)) as unknown as Row[];
    const row = rows.find((r) => emailChangeTokenMatches(input.token, r.token_hash));
    if (!row || !emailChangeUsable(row)) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, EMAIL_CHANGE_MESSAGES.invalid);
    }
    return new StepResponse(row);
  },
);

export type EmailChangeTarget = {
  request_id: string;
  customer_id: string;
  old_email: string;
  new_email: string;
  first_name: string | null;
  auth_identity_id: string;
  provider_identity_id: string;
};

/** Cliente con cuenta, su identidad de acceso y que el email nuevo no lo use otra cuenta. */
export const validateEmailChangeStep = createStep(
  "validate-email-change",
  async (row: Row, { container }) => {
    const c = container as MedusaContainer;
    const [customer] = await customers(c).listCustomers(
      { id: row.customer_id, has_account: true },
      { select: ["id", "email", "first_name"] },
    );
    if (!customer?.email) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, EMAIL_CHANGE_MESSAGES.invalid);
    }
    const auth = c.resolve(Modules.AUTH);
    const [identity] = await auth.listAuthIdentities(
      { app_metadata: { customer_id: row.customer_id } } as never,
      { relations: ["provider_identities"] },
    );
    const provider = identity?.provider_identities?.find((p) => p.provider === "emailpass");
    if (!identity || !provider) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, EMAIL_CHANGE_MESSAGES.invalid);
    }
    const taken = await auth.listProviderIdentities({
      entity_id: row.new_email,
      provider: "emailpass",
    } as never);
    if (taken.length) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, EMAIL_CHANGE_MESSAGES.taken);
    }
    return new StepResponse<EmailChangeTarget>({
      request_id: row.id,
      customer_id: customer.id,
      old_email: customer.email,
      new_email: row.new_email,
      first_name: customer.first_name ?? null,
      auth_identity_id: identity.id,
      provider_identity_id: provider.id,
    });
  },
);

/** Marca la solicitud como usada (un solo uso). Compensación: sin usar. */
export const useEmailChangeStep = createStep(
  "use-email-change",
  async (t: EmailChangeTarget, { container }) => {
    await svc(container).updateEmailChanges({ id: t.request_id, used_at: new Date() });
    return new StepResponse(undefined, t.request_id);
  },
  async (id, { container }) => {
    if (id) await svc(container).updateEmailChanges({ id, used_at: null });
  },
);

/**
 * Email de acceso: `entity_id` de la identidad `emailpass` y una verificación confirmada para el
 * email nuevo (el enlace llegó a él). Medusa tiene un índice único (identidad + email + tipo): si
 * ese email ya tuvo una verificación (p. ej. vuelve a uno anterior), se marca como verificada en
 * vez de crear otra. Si algo falla DENTRO del paso, se deshace aquí (Medusa solo compensa los
 * pasos que terminaron). Compensación: el email de antes y la verificación como estaba.
 */
type LoginUndo = {
  provider: string;
  old: string;
  created: string | null;
  updated: { id: string; verified_at: Date | string | null } | null;
};

async function undoLoginEmail(c: MedusaContainer, u: LoginUndo) {
  const auth = c.resolve(Modules.AUTH);
  const v = auth as unknown as AuthWithVerifications;
  await auth.updateProviderIdentities([{ id: u.provider, entity_id: u.old }]);
  if (u.created) await v.deleteAuthVerifications([u.created]);
  if (u.updated) await v.updateAuthVerifications([u.updated]);
}

export const changeLoginEmailStep = createStep(
  "change-login-email",
  async (t: EmailChangeTarget, { container }) => {
    const c = container as MedusaContainer;
    const auth = c.resolve(Modules.AUTH);
    const v = auth as unknown as AuthWithVerifications;
    const undo: LoginUndo = {
      provider: t.provider_identity_id,
      old: t.old_email,
      created: null,
      updated: null,
    };
    try {
      await auth.updateProviderIdentities([{ id: t.provider_identity_id, entity_id: t.new_email }]);
      const [existing] = await auth.listAuthVerifications({
        auth_identity_id: t.auth_identity_id,
        entity_id: t.new_email,
        entity_type: "email",
      } as never);
      if (existing?.id) {
        undo.updated = { id: existing.id, verified_at: existing.verified_at ?? null };
        await v.updateAuthVerifications([{ id: existing.id, verified_at: new Date() }]);
      } else {
        const [created] = await v.createAuthVerifications([
          {
            auth_identity_id: t.auth_identity_id,
            entity_id: t.new_email,
            entity_type: "email",
            code_provider: "email-change",
            requested_at: new Date(),
            verified_at: new Date(),
          },
        ]);
        undo.created = created?.id ?? null;
      }
    } catch (e) {
      await undoLoginEmail(c, undo);
      throw e;
    }
    return new StepResponse(undefined, undo);
  },
  async (undo, { container }) => {
    if (undo) await undoLoginEmail(container as MedusaContainer, undo);
  },
);

/** Email del cliente. Compensación: el de antes. */
export const changeCustomerEmailStep = createStep(
  "change-customer-email",
  async (t: EmailChangeTarget, { container }) => {
    await customers(container).updateCustomers(t.customer_id, { email: t.new_email });
    return new StepResponse(undefined, { id: t.customer_id, email: t.old_email });
  },
  async (prev, { container }) => {
    if (prev) await customers(container).updateCustomers(prev.id, { email: prev.email });
  },
);

/**
 * Email de los pedidos EN CURSO del cliente (los terminados se quedan con el suyo), con
 * `updateOrderWorkflow` de Medusa (deja el cambio en el historial del pedido). Compensación: el
 * email de antes en los que se cambiaron.
 */
export const changeOrdersEmailStep = createStep(
  "change-orders-email",
  async (t: EmailChangeTarget, { container }) => {
    const c = container as MedusaContainer;
    const { data } = await c.resolve(ContainerRegistrationKeys.QUERY).graph({
      entity: "order",
      fields: [
        "id",
        "email",
        "status",
        "canceled_at",
        "items.quantity",
        "items.detail.shipped_quantity",
        "returns.status",
      ],
      filters: { customer_id: t.customer_id },
    });
    const changed: { id: string; email: string }[] = [];
    try {
      for (const o of data as unknown as (OrderForDeletion & { id: string; email: string })[]) {
        if (!changesOrderEmail(o) || o.email === t.new_email) continue;
        await updateOrderWorkflow(c).run({
          input: { id: o.id, email: t.new_email, user_id: t.customer_id },
        });
        changed.push({ id: o.id, email: o.email });
      }
    } catch (e) {
      await restoreOrdersEmail(c, changed, t.customer_id);
      throw e;
    }
    return new StepResponse(changed.length, { changed, customer_id: t.customer_id });
  },
  async (prev, { container }) => {
    if (prev?.changed.length) {
      await restoreOrdersEmail(container as MedusaContainer, prev.changed, prev.customer_id);
    }
  },
);

async function restoreOrdersEmail(
  c: MedusaContainer,
  orders: { id: string; email: string }[],
  userId: string,
) {
  for (const o of orders) {
    await updateOrderWorkflow(c).run({ input: { id: o.id, email: o.email, user_id: userId } });
  }
}
