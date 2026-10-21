import type {
  ICustomerModuleService,
  IOrderModuleService,
  MedusaContainer,
} from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { AUTO_TRANSFER, LINKED_META_KEY, normalizeEmail } from "../../lib/guest-orders";

/**
 * Pasos de «pedidos de invitado → cuenta» (Fase G). La transferencia en sí la hacen los
 * workflows oficiales (`requestOrderTransferWorkflow` + `acceptOrderTransferWorkflow`, spike G-0).
 */

const query = (c: unknown) => (c as MedusaContainer).resolve(ContainerRegistrationKeys.QUERY);
const orderModule = (c: unknown) =>
  (c as MedusaContainer).resolve<IOrderModuleService>(Modules.ORDER);
const customerModule = (c: unknown) =>
  (c as MedusaContainer).resolve<ICustomerModuleService>(Modules.CUSTOMER);

export type LinkInput = {
  order_id: string;
  customer_id: string;
  reason: string;
  /** Nota interna del order change (solo Admin): motivo de una asignación manual (G-3). */
  internal_note?: string;
};

type OrderRow = {
  id: string;
  email?: string | null;
  status?: string | null;
  canceled_at?: unknown;
  customer_id?: string | null;
  customer?: { has_account?: boolean | null } | null;
};

/**
 * Solo se pasa un pedido sin cancelar de un INVITADO a una cuenta. Con el motivo «mismo email»
 * (G-1), el email del pedido tiene que ser el de la cuenta (verificado al registrarse).
 */
export const validateLinkStep = createStep(
  "validate-guest-order-link",
  async (input: LinkInput, { container }) => {
    const {
      data: [order],
    } = await query(container).graph({
      entity: "order",
      fields: ["id", "email", "status", "canceled_at", "customer_id", "customer.has_account"],
      filters: { id: input.order_id },
    });
    const o = order as OrderRow | undefined;
    if (!o) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Pedido no encontrado");
    if (o.status === "canceled" || o.canceled_at) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "El pedido está cancelado");
    }
    if (o.customer_id === input.customer_id) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "El pedido ya es de la cuenta");
    }
    if (o.customer?.has_account) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "El pedido es de otra cuenta");
    }
    const [account] = await customerModule(container).listCustomers(
      { id: input.customer_id },
      { select: ["id", "email", "has_account"] },
    );
    if (!account?.has_account) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "El destino no es una cuenta");
    }
    if (
      input.reason === AUTO_TRANSFER.sameEmail &&
      normalizeEmail(o.email) !== normalizeEmail(account.email)
    ) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "El email no coincide");
    }
    return new StepResponse({ order_id: o.id });
  },
);

/**
 * Token de la solicitud recién creada (`requestOrderTransferWorkflow` lo guarda en
 * `actions.details.token` del order change y no lo devuelve; spike G-0). Solo lectura.
 */
export const transferTokenStep = createStep(
  "guest-order-transfer-token",
  async (input: { order_id: string }, { container }) => {
    const { data } = await query(container).graph({
      entity: "order_change",
      fields: ["id", "actions.action", "actions.details"],
      filters: { order_id: input.order_id, status: ["requested"] },
    });
    // Los tipos de Query (.medusa/types) usan su propia unión de strings: se compara el string.
    const action = (data[0]?.actions ?? []).find((a) => String(a?.action) === "TRANSFER_CUSTOMER");
    const token = (action?.details as { token?: unknown } | undefined)?.token;
    if (typeof token !== "string" || !token) {
      throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Solicitud sin token");
    }
    return new StepResponse(token);
  },
);

/**
 * Marca el pedido como «añadido a tu cuenta» (`metadata.cuenta_vinculada`) sin perder el resto de
 * la metadata. Compensación: deja la metadata como estaba.
 */
export const markLinkedStep = createStep(
  "mark-guest-order-linked",
  async (input: { order_id: string; reason: string }, { container }) => {
    const orders = orderModule(container);
    const order = await orders.retrieveOrder(input.order_id, { select: ["id", "metadata"] });
    const previous = (order.metadata ?? null) as Record<string, unknown> | null;
    await orders.updateOrders(input.order_id, {
      metadata: {
        ...(previous ?? {}),
        [LINKED_META_KEY]: { at: new Date().toISOString(), reason: input.reason },
      },
    });
    return new StepResponse(undefined, { order_id: input.order_id, previous });
  },
  async (undo, { container }) => {
    if (!undo) return;
    await orderModule(container).updateOrders(undo.order_id, { metadata: undo.previous ?? {} });
  },
);
