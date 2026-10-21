import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { linkOrderToAccountWorkflow } from "../workflows/guest-orders";
import { AUTO_TRANSFER, normalizeEmail, type AutoTransferReason } from "./guest-orders";

/**
 * Enlace automático de pedidos de invitado con el MISMO email que la cuenta (Fase G-1). Lo usan
 * los subscribers de `customer.created` y `order.placed` y el script `orders:link-guests`.
 * Nunca registra emails (AGENTS §7.1): solo ids.
 */

const PAGE = 100;

type Customer = { id: string; email?: string | null; has_account?: boolean | null };

/** Cuenta (has_account) con ese email, si existe. */
export async function findAccountByEmail(
  container: MedusaContainer,
  email: string | null | undefined,
): Promise<Customer | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const [account] = await container
    .resolve(Modules.CUSTOMER)
    .listCustomers({ email: normalized, has_account: true }, { select: ["id", "email"] });
  return account ?? null;
}

/** Ids de los pedidos sin cancelar de los clientes invitado con ese email. */
export async function guestOrderIds(container: MedusaContainer, email: string): Promise<string[]> {
  const guests = await container
    .resolve(Modules.CUSTOMER)
    .listCustomers({ email, has_account: false }, { select: ["id"] });
  if (!guests.length) return [];
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const ids: string[] = [];
  for (let skip = 0; ; skip += PAGE) {
    const { data } = await query.graph({
      entity: "order",
      fields: ["id", "status", "canceled_at"],
      filters: { customer_id: guests.map((g) => g.id) },
      pagination: { skip, take: PAGE, order: { created_at: "ASC" } },
    });
    const rows = data as { id: string; status?: string | null; canceled_at?: unknown }[];
    ids.push(...rows.filter((o) => o.status !== "canceled" && !o.canceled_at).map((o) => o.id));
    if (rows.length < PAGE) break;
  }
  return ids;
}

/** Pasa un pedido a la cuenta; un fallo se registra (sin datos personales) y no se relanza. */
async function linkOne(
  container: MedusaContainer,
  orderId: string,
  customerId: string,
  reason: AutoTransferReason,
): Promise<boolean> {
  try {
    await linkOrderToAccountWorkflow(container).run({
      input: { order_id: orderId, customer_id: customerId, reason },
    });
    return true;
  } catch (err) {
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn(`guest-orders: pedido ${orderId} no enlazado: ${(err as Error).message}`);
    return false;
  }
}

/** Al crear la cuenta: pasa a ella los pedidos de invitado con su email. */
export async function linkGuestOrdersToAccount(
  container: MedusaContainer,
  customerId: string,
): Promise<{ found: number; linked: number }> {
  const [account] = await container
    .resolve(Modules.CUSTOMER)
    .listCustomers({ id: customerId }, { select: ["id", "email", "has_account"] });
  const email = normalizeEmail(account?.email);
  if (!account?.has_account || !email) return { found: 0, linked: 0 };
  const ids = await guestOrderIds(container, email);
  let linked = 0;
  for (const id of ids) {
    if (await linkOne(container, id, account.id, AUTO_TRANSFER.sameEmail)) linked++;
  }
  if (linked) {
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .info(`guest-orders: ${linked} pedidos de invitado pasados a la cuenta ${account.id}`);
  }
  return { found: ids.length, linked };
}

/**
 * Al hacer un pedido sin entrar (C1): si quedó en un invitado y hay una cuenta con ese email, se
 * pasa a la cuenta. Medusa ya lo pone en la cuenta si el email no tenía ficha de invitado
 * (spike G-0); con ficha de invitado previa, siempre va al invitado.
 */
export async function linkOrderIfAccount(
  container: MedusaContainer,
  orderId: string,
): Promise<boolean> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const {
    data: [order],
  } = await query.graph({
    entity: "order",
    fields: ["id", "email", "customer_id", "customer.has_account"],
    filters: { id: orderId },
  });
  const o = order as
    | { id: string; email?: string | null; customer?: { has_account?: boolean | null } | null }
    | undefined;
  if (!o || o.customer?.has_account) return false;
  const account = await findAccountByEmail(container, o.email);
  if (!account) return false;
  return linkOne(container, o.id, account.id, AUTO_TRANSFER.sameEmail);
}

/**
 * Datos existentes (script `orders:link-guests`): todas las cuentas que tengan pedidos de
 * invitado con su email. `dryRun`: solo cuenta.
 */
export async function linkAllGuestOrders(
  container: MedusaContainer,
  dryRun: boolean,
): Promise<{ accounts: number; found: number; linked: number }> {
  const customers = container.resolve(Modules.CUSTOMER);
  let accounts = 0;
  let found = 0;
  let linked = 0;
  for (let skip = 0; ; skip += PAGE) {
    const page = await customers.listCustomers(
      { has_account: true },
      { select: ["id", "email"], skip, take: PAGE, order: { created_at: "ASC" } },
    );
    for (const account of page) {
      const email = normalizeEmail(account.email);
      if (!email) continue;
      const ids = await guestOrderIds(container, email);
      if (!ids.length) continue;
      accounts++;
      found += ids.length;
      if (dryRun) continue;
      for (const id of ids) {
        if (await linkOne(container, id, account.id, AUTO_TRANSFER.sameEmail)) linked++;
      }
    }
    if (page.length < PAGE) break;
  }
  return { accounts, found, linked };
}
