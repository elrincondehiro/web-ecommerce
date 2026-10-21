import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { linkAllGuestOrders } from "../lib/guest-orders-link";

/**
 * Fase G-1, datos existentes: pasa a cada cuenta los pedidos de invitado con su mismo email (lo
 * que hacen los subscribers a partir de ahora). Idempotente: un pedido ya pasado no se repite.
 *
 *   pnpm --filter backend orders:link-guests [dry-run]
 */
export default async function ordersLinkGuests({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const dryRun = args.includes("dry-run");
  const r = await linkAllGuestOrders(container, dryRun);
  logger.info(
    dryRun
      ? `orders:link-guests (dry-run): ${r.found} pedidos de invitado en ${r.accounts} cuentas`
      : `orders:link-guests: ${r.linked} de ${r.found} pedidos pasados (${r.accounts} cuentas)`,
  );
}
