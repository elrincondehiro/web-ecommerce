import type {
  CustomerAddressDTO,
  ICustomerModuleService,
  MedusaContainer,
} from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import {
  anonymizedEmail,
  isPendingOrder,
  PENDING_ORDERS_MESSAGE,
  type OrderForDeletion,
} from "../../lib/account-deletion";
import { POINTS_MODULE } from "../../modules/points";
import type PointsModuleService from "../../modules/points/service";

/**
 * Pasos de la baja de la cuenta (fase 13, docs/fases/fase13-cuenta.md). Los que escriben tienen
 * compensación, salvo el último (historial de emails), que va al final del workflow.
 * Fuentes: context7 /medusajs/medusa (createStep con compensación; «Delete User of Actor Type»);
 * código de @medusajs/core-flows 2.22.7 (`removeCustomerAccountWorkflow`).
 */

const customers = (c: unknown) =>
  (c as MedusaContainer).resolve<ICustomerModuleService>(Modules.CUSTOMER);

export type AccountToDelete = {
  id: string;
  email: string | null;
  first_name: string | null;
  has_account: boolean;
};

/** El cliente existe y no tiene pedidos en curso; devuelve los datos para el email de despedida. */
export const validateAccountDeletionStep = createStep(
  "validate-account-deletion",
  async (input: { customer_id: string }, { container }) => {
    const query = (container as MedusaContainer).resolve(ContainerRegistrationKeys.QUERY);
    const {
      data: [customer],
    } = await query.graph({
      entity: "customer",
      fields: ["id", "email", "first_name", "has_account"],
      filters: { id: input.customer_id },
    });
    if (!customer) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Cliente no encontrado");
    const { data: orders } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "status",
        "canceled_at",
        "items.quantity",
        "items.detail.shipped_quantity",
        "returns.status",
      ],
      filters: { customer_id: input.customer_id },
    });
    if ((orders as unknown as OrderForDeletion[]).some(isPendingOrder)) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, PENDING_ORDERS_MESSAGE);
    }
    return new StepResponse<AccountToDelete>({
      id: customer.id,
      email: customer.email ?? null,
      first_name: customer.first_name ?? null,
      has_account: Boolean(customer.has_account),
    });
  },
);

/** Saldo de puntos del cliente (0 si no tiene cuenta de puntos). Solo lectura. */
export const pointsBalanceStep = createStep(
  "account-deletion-points-balance",
  async (input: { customer_id: string }, { container }) => {
    const service = (container as MedusaContainer).resolve<PointsModuleService>(POINTS_MODULE);
    const account = await service.findAccount(input.customer_id);
    return new StepResponse(account ? await service.getBalance(account.id) : 0);
  },
);

type CustomerSnapshot = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  company_name: string | null;
  metadata: Record<string, unknown> | null;
  addresses: CustomerAddressDTO[];
};

/**
 * Anonimiza la ficha (email `borrado-<id>@invalid`, sin nombre, teléfono, empresa ni metadata)
 * y BORRA sus direcciones (el borrado suave del cliente las dejaría con los datos).
 * Compensación: los datos y las direcciones de antes (con ids nuevos).
 */
export const anonymizeCustomerStep = createStep(
  "anonymize-customer",
  async (input: { customer_id: string }, { container }) => {
    const svc = customers(container);
    const c = await svc.retrieveCustomer(input.customer_id, { relations: ["addresses"] });
    const snapshot: CustomerSnapshot = {
      id: c.id,
      email: c.email ?? null,
      first_name: c.first_name ?? null,
      last_name: c.last_name ?? null,
      phone: c.phone ?? null,
      company_name: c.company_name ?? null,
      metadata: (c.metadata as Record<string, unknown> | null) ?? null,
      addresses: c.addresses ?? [],
    };
    if (snapshot.addresses.length) {
      await svc.deleteCustomerAddresses(snapshot.addresses.map((a) => a.id));
    }
    await svc.updateCustomers(c.id, {
      email: anonymizedEmail(c.id),
      first_name: null,
      last_name: null,
      phone: null,
      company_name: null,
      metadata: null,
    });
    return new StepResponse(undefined, snapshot);
  },
  async (snapshot, { container }) => {
    if (!snapshot) return;
    const svc = customers(container);
    await svc.updateCustomers(snapshot.id, {
      email: snapshot.email,
      first_name: snapshot.first_name,
      last_name: snapshot.last_name,
      phone: snapshot.phone,
      company_name: snapshot.company_name,
      metadata: snapshot.metadata,
    });
    if (snapshot.addresses.length) {
      await svc.createCustomerAddresses(
        snapshot.addresses.map((a) => {
          const { id, created_at, ...rest } = a;
          void id;
          void created_at;
          return { ...rest, customer_id: snapshot.id };
        }) as never,
      );
    }
  },
);

/**
 * Historial de emails (tabla `notification` de Medusa): los enviados al cliente pasan al email
 * anónimo y sin los datos de la plantilla. Sin compensación: va el último. También lo usa el
 * subscriber del email de despedida, después de enviarlo.
 */
export async function anonymizeNotifications(
  container: MedusaContainer,
  email: string,
  customerId: string,
): Promise<number> {
  const svc = container.resolve(Modules.NOTIFICATION) as unknown as {
    listNotifications(f: { to: string }, c: { select: string[] }): Promise<{ id: string }[]>;
    updateNotifications(d: { id: string; to: string; data: null }[]): Promise<unknown>;
  };
  const rows = await svc.listNotifications({ to: email }, { select: ["id"] });
  if (rows.length) {
    await svc.updateNotifications(
      rows.map((r) => ({ id: r.id, to: anonymizedEmail(customerId), data: null })),
    );
  }
  return rows.length;
}

export const anonymizeNotificationsStep = createStep(
  "anonymize-customer-notifications",
  async (input: { customer_id: string; email: string | null }, { container }) => {
    const n = input.email
      ? await anonymizeNotifications(container as MedusaContainer, input.email, input.customer_id)
      : 0;
    return new StepResponse(n);
  },
);
