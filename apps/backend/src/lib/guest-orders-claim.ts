import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  cancelOrderTransferRequestWorkflow,
  requestOrderTransferWorkflow,
} from "@medusajs/medusa/core-flows";
import {
  AUTO_TRANSFER,
  CLAIM_TRANSFER,
  MAX_PENDING_CLAIMS,
  normalizeEmail,
  transferTtlDays,
} from "./guest-orders";
import { linkOrderToAccountWorkflow } from "../workflows/guest-orders";

/**
 * Reclamar un pedido hecho como INVITADO (Fase G-2). Solo pedidos de invitado: nunca de otra
 * cuenta (D: no se transfieren pedidos entre cuentas). La respuesta al cliente es SIEMPRE la
 * misma, pase lo que pase aquí (no revela si el pedido existe, si el email coincide o si ya es de
 * una cuenta). Nunca registra emails ni números de pedido (solo ids internos).
 */

export type ClaimOutcome =
  | "requested" // solicitud creada: email al email del pedido
  | "linked" // mismo email que la cuenta: pasado sin email (como G-1)
  | "ignored"; // no existe, no coincide, no es de invitado, cancelado, pendiente o tope

type OrderRow = {
  id: string;
  email?: string | null;
  status?: string | null;
  canceled_at?: unknown;
  customer_id?: string | null;
  customer?: { has_account?: boolean | null } | null;
};

/** Pedido por nº visible + email del pedido (minúsculas). */
async function findOrder(
  container: MedusaContainer,
  displayId: number,
  email: string,
): Promise<OrderRow | null> {
  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "order",
    fields: ["id", "email", "status", "canceled_at", "customer_id", "customer.has_account"],
    filters: { display_id: displayId, email } as never,
  });
  return (data[0] as OrderRow | undefined) ?? null;
}

async function pendingTransfers(
  container: MedusaContainer,
  filters: Record<string, unknown>,
): Promise<{ id: string; order_id: string }[]> {
  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "order_change",
    fields: ["id", "order_id"],
    filters: { change_type: "transfer", status: "requested", ...filters } as never,
  });
  return data as { id: string; order_id: string }[];
}

export async function claimGuestOrder(
  container: MedusaContainer,
  input: { customer_id: string; display_id: number; email: string },
): Promise<ClaimOutcome> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const email = normalizeEmail(input.email);
  if (!email) return "ignored";
  const [account] = await container
    .resolve(Modules.CUSTOMER)
    .listCustomers({ id: input.customer_id }, { select: ["id", "email", "has_account"] });
  if (!account?.has_account) return "ignored";

  const order = await findOrder(container, input.display_id, email);
  if (
    !order ||
    order.customer?.has_account || // de una cuenta (también la propia): nunca entre cuentas
    order.status === "canceled" ||
    order.canceled_at
  ) {
    return "ignored";
  }
  if ((await pendingTransfers(container, { order_id: order.id })).length) return "ignored";

  try {
    if (email === normalizeEmail(account.email)) {
      // Su propio email: ya está verificado; se pasa como en G-1 (sin email).
      await linkOrderToAccountWorkflow(container).run({
        input: { order_id: order.id, customer_id: account.id, reason: AUTO_TRANSFER.sameEmail },
      });
      return "linked";
    }
    if (
      (await pendingTransfers(container, { requested_by: account.id })).length >= MAX_PENDING_CLAIMS
    ) {
      return "ignored";
    }
    await requestOrderTransferWorkflow(container).run({
      input: {
        order_id: order.id,
        customer_id: account.id,
        logged_in_user: account.id,
        description: CLAIM_TRANSFER,
        update_order_email: true, // D3: al aceptar pasa al email de la cuenta
      },
    });
    return "requested";
  } catch (err) {
    logger.warn(`guest-orders: reclamación del pedido ${order.id}: ${(err as Error).message}`);
    return "ignored";
  }
}

/**
 * Caduca las solicitudes de transferencia pendientes de más de `ORDER_TRANSFER_TTL_DAYS` días
 * (job `order-transfer-expire`): una solicitud pendiente bloquea cualquier otro cambio del pedido
 * (devoluciones, ediciones; spike G-0). Se cancelan como el Admin (`actor_type: "user"`).
 */
export async function expireOrderTransfers(
  container: MedusaContainer,
  now = new Date(),
): Promise<number> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const days = transferTtlDays(process.env.ORDER_TRANSFER_TTL_DAYS);
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const stale = await pendingTransfers(container, { requested_at: { $lt: cutoff } });
  let canceled = 0;
  for (const change of stale) {
    try {
      await cancelOrderTransferRequestWorkflow(container).run({
        input: {
          order_id: change.order_id,
          logged_in_user_id: "order-transfer-expire",
          actor_type: "user",
        },
      });
      canceled++;
    } catch (err) {
      logger.warn(`order-transfer-expire: pedido ${change.order_id}: ${(err as Error).message}`);
    }
  }
  if (canceled) logger.info(`order-transfer-expire: ${canceled} solicitudes caducadas`);
  return canceled;
}
