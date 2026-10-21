import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { orderTransferUrl } from "../lib/emails";
import { isAutoTransfer, maskEmail, transferTtlDays } from "../lib/guest-orders";
import { emailEnabled, hashKey, linksFrom, sendEmail } from "./_email";

/**
 * Fase G-2: solicitud de transferencia (reclamación del cliente o «Transfer ownership» del
 * Admin) → email al email ACTUAL del pedido con el enlace para aceptar o rechazar. El token no va
 * en el evento: está en `actions.details.token` del order change (context7 /medusajs/medusa,
 * request-order-transfer). Las transferencias automáticas (G-1, G-3: `auto:`) no envían nada.
 * Nunca se registran el email ni el token.
 */
export default async function orderTransferRequestedEmail({
  event: { data },
  container,
}: SubscriberArgs<{ id: string; order_change_id: string }>) {
  if (!emailEnabled()) return;
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const {
    data: [change],
  } = await query.graph({
    entity: "order_change",
    fields: [
      "id",
      "status",
      "description",
      "actions.action",
      "actions.reference_id",
      "actions.details",
      "order.display_id",
      "order.email",
    ],
    filters: { id: data.order_change_id },
  });
  const c = change as
    | {
        status?: string | null;
        description?: string | null;
        order?: { display_id?: number | null; email?: string | null } | null;
        actions?:
          | ({
              action?: string | null;
              reference_id?: string | null;
              details?: { token?: unknown; original_email?: unknown } | null;
            } | null)[]
          | null;
      }
    | undefined;
  if (!c || c.status !== "requested" || isAutoTransfer(c.description)) return;
  const action = (c.actions ?? []).find((a) => String(a?.action) === "TRANSFER_CUSTOMER");
  const token = action?.details?.token;
  const to = (action?.details?.original_email as string | undefined) ?? c.order?.email;
  if (typeof token !== "string" || !to) {
    logger.warn(`order-transfer-email: solicitud ${data.order_change_id} sin token o email`);
    return;
  }
  const {
    data: [account],
  } = await query.graph({
    entity: "customer",
    fields: ["email"],
    filters: { id: action?.reference_id ?? "" },
  });
  const links = linksFrom(container);
  await sendEmail(container, {
    to,
    template: "order-transfer",
    data: {
      ...links,
      displayId: c.order?.display_id ?? data.id,
      requestedBy: maskEmail((account as { email?: string } | undefined)?.email),
      transferUrl: orderTransferUrl(links.storefrontUrl, data.id, token),
      expiresInDays: transferTtlDays(process.env.ORDER_TRANSFER_TTL_DAYS),
    },
    idempotencyKey: hashKey("order-transfer", data.order_change_id),
  });
}

export const config: SubscriberConfig = { event: "order.transfer_requested" };
