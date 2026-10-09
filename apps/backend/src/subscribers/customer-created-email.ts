import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { accountUrl } from "../lib/emails";
import { emailEnabled, linksFrom, sendEmail } from "./_email";

/**
 * Bienvenida (fase 9). `customer.created` lleva solo `{ id }` (core-flows 2.21.2,
 * `createCustomersWorkflow`) y se emite también al comprar como invitado: solo se envía si el
 * cliente tiene cuenta (`has_account`, `createCustomerAccountWorkflow`). Con la verificación
 * obligatoria, el cliente con cuenta se crea tras confirmar el email e iniciar sesión.
 */
export default async function customerCreatedEmail({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  if (!emailEnabled()) return;
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const {
    data: [customer],
  } = await query.graph({
    entity: "customer",
    fields: ["id", "email", "has_account"],
    filters: { id: data.id },
  });
  if (!customer?.has_account || !customer.email) return;

  const links = linksFrom(container);
  await sendEmail(container, {
    to: customer.email,
    template: "welcome",
    data: { ...links, accountUrl: accountUrl(links.storefrontUrl) },
    idempotencyKey: `welcome/${customer.id}`,
  });
}

export const config: SubscriberConfig = {
  event: "customer.created",
};
