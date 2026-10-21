import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { AUTO_TRANSFER, normalizeEmail } from "../lib/guest-orders";
import { linkOrderToAccountWorkflow } from "../workflows/guest-orders";

/**
 * Fase G-3: asignación manual de un pedido de INVITADO a una cuenta, sin email de aceptación
 * (el cliente ya no controla el email del pedido y la tienda lo ha comprobado a mano). Queda en
 * el historial del pedido (motivo en la nota interna) y el pedido pasa al email de la cuenta.
 * Para deshacerlo: Admin → pedido → transferir a invitado. Entre cuentas: «Transfer ownership»
 * del Admin (D10).
 *
 *   pnpm --filter backend orders:assign <nº pedido> <email|cus_…> <motivo…> [dry-run]
 *
 * No registra el email ni el motivo (solo ids).
 */
export default async function ordersAssign({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const dryRun = args.includes("dry-run");
  const [rawId, who, ...rest] = args.filter((a) => a !== "dry-run");
  const note = rest.join(" ").trim();
  const displayId = Number(String(rawId ?? "").replace(/^#/, ""));
  if (!Number.isInteger(displayId) || displayId < 1 || !who || note.length < 3) {
    logger.error("Uso: orders:assign <nº pedido> <email|cus_…> <motivo> [dry-run]");
    return;
  }
  const customers = container.resolve(Modules.CUSTOMER);
  const [account] = who.startsWith("cus_")
    ? await customers.listCustomers({ id: who, has_account: true }, { select: ["id"] })
    : await customers.listCustomers(
        { email: normalizeEmail(who) ?? "", has_account: true },
        { select: ["id"] },
      );
  if (!account) {
    logger.error("orders:assign: cuenta no encontrada.");
    return;
  }
  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "order",
    fields: ["id"],
    filters: { display_id: displayId } as never,
  });
  const order = data[0] as { id: string } | undefined;
  if (!order) {
    logger.error("orders:assign: pedido no encontrado.");
    return;
  }
  if (dryRun) {
    logger.info(`orders:assign (dry-run): pedido ${order.id} → cuenta ${account.id}`);
    return;
  }
  try {
    await linkOrderToAccountWorkflow(container).run({
      input: {
        order_id: order.id,
        customer_id: account.id,
        reason: AUTO_TRANSFER.manual,
        internal_note: note,
      },
    });
    logger.info(`orders:assign: pedido ${order.id} pasado a la cuenta ${account.id}`);
  } catch (err) {
    logger.error(`orders:assign: ${(err as Error).message}`);
  }
}
