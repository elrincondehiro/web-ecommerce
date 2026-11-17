import {
  createWorkflow,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { emitEventStep, removeCustomerAccountWorkflow } from "@medusajs/medusa/core-flows";
import { REF } from "../../lib/points";
import { pointsMovementWorkflow } from "../points";
import {
  anonymizeCustomerStep,
  anonymizeNotificationsStep,
  pointsBalanceStep,
  validateAccountDeletionStep,
} from "./steps";

/**
 * Baja de la cuenta (fase 13, docs/fases/fase13-cuenta.md), desde «Mi cuenta → Eliminar mi
 * cuenta» o desde el Admin (botón «Eliminar» del cliente, ruta `DELETE /admin/customers/:id`
 * propia). Orden:
 *  1. sin pedidos en curso (si no, no borra nada);
 *  2. el saldo de puntos se pierde (G6) y los movimientos se conservan;
 *  3. ficha anonimizada y direcciones borradas;
 *  4. `removeCustomerAccountWorkflow` de Medusa: borra (suave) el cliente y su identidad de acceso
 *     (contraseña). Emite `customer.deleted`: los subscribers borran mascotas y fotos,
 *     consentimientos, avisos de stock, la lista de deseos y los carritos abiertos;
 *  5. historial de emails anonimizado (sin compensación: al final) y evento `ACCOUNT_DELETED`:
 *     email de despedida (solo cuentas; vuelve a anonimizar el historial después) y aviso a la
 *     tienda, en subscribers (worker). Los pedidos se conservan (obligación fiscal).
 * Fuentes: context7 /medusajs/medusa (Delete User of Actor Type, runAsStep, emitEventStep);
 * código de @medusajs/core-flows 2.22.7.
 */
export const ACCOUNT_DELETED = "customer.account_deleted";

export type AccountDeletedData = {
  customer_id: string;
  /** Solo para el email de despedida (cuentas); el aviso a la tienda no lo usa. */
  email: string | null;
  first_name: string | null;
  deleted_at: string;
  reason: string | null;
  via: "cuenta" | "admin";
};

export type DeleteAccountInput = {
  customer_id: string;
  reason: string | null;
  via: "cuenta" | "admin";
};

export const deleteAccountWorkflow = createWorkflow(
  "delete-account",
  (input: DeleteAccountInput) => {
    const account = validateAccountDeletionStep({ customer_id: input.customer_id });

    const balance = pointsBalanceStep({ customer_id: input.customer_id });
    when({ balance }, ({ balance }) => balance > 0).then(() => {
      const movement = transform({ input, balance }, ({ input, balance }) => ({
        customer_id: input.customer_id,
        type: "debit" as const,
        amount: balance,
        reference: REF.deleted,
        reference_id: input.customer_id,
        note: "Baja de la cuenta",
      }));
      pointsMovementWorkflow.runAsStep({ input: movement });
    });

    anonymizeCustomerStep({ customer_id: input.customer_id });
    removeCustomerAccountWorkflow.runAsStep({ input: { customerId: input.customer_id } });

    const notify = transform({ account }, ({ account }) => ({
      customer_id: account.id,
      email: account.email,
    }));
    anonymizeNotificationsStep(notify);

    const data = transform({ input, account }, ({ input, account }): AccountDeletedData => ({
      customer_id: input.customer_id,
      email: account.has_account ? account.email : null,
      first_name: account.has_account ? account.first_name : null,
      deleted_at: new Date().toISOString(),
      reason: input.reason,
      via: input.via,
    }));
    emitEventStep({ eventName: ACCOUNT_DELETED, data });

    return new WorkflowResponse(data);
  },
);
