import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { linkOrderIfAccount } from "../lib/guest-orders-link";

/**
 * Fase G-1 (C1): un cliente con cuenta que compra sin entrar. Si el pedido quedó en su ficha de
 * invitado (spike G-0: pasa siempre que el email ya tenía una), se pasa a la cuenta.
 */
export default async function guestOrdersOrderPlaced({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  await linkOrderIfAccount(container, data.id);
}

export const config: SubscriberConfig = { event: "order.placed" };
