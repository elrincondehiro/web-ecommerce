import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { linkGuestOrdersToAccount } from "../lib/guest-orders-link";

/**
 * Fase G-1: al crear la cuenta (primer login tras verificar el email, fase 9), pasa a ella los
 * pedidos de invitado con el mismo email. `customer.created` también sale al comprar como
 * invitado: `linkGuestOrdersToAccount` no hace nada si el cliente no tiene cuenta.
 */
export default async function guestOrdersAccountCreated({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  await linkGuestOrdersToAccount(container, data.id);
}

export const config: SubscriberConfig = { event: "customer.created" };
