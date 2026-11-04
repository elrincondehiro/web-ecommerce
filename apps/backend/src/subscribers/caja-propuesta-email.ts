import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { cajaAnswerUrl, contentLine } from "../lib/caja";
import { orderCajaContext, orderCajas } from "../lib/caja-data";
import { cajaTimeConfig, deadline, deadlineLabel } from "../lib/caja-time";
import { CAJA_META } from "../lib/line-data";
import { CAJA_EVENTS } from "../workflows/caja/respuesta";
import { emailEnabled, hashKey, linksFrom, sendEmail } from "./_email";

/**
 * Caja de snacks propuesta (Fase CS-4): UN email al cliente (email del pedido) con todas las
 * cajas propuestas ahora y el enlace de cada una. Los tokens llegan en el evento (en la base de
 * datos solo está su hash) y no se registran nunca. Idempotente por caja y propuesta.
 */
export default async function cajaPropuestaEmail({
  event: { data },
  container,
}: SubscriberArgs<{
  order_id: string;
  tokens: { line_item_id: string; token: string }[];
  proposed_at: string;
}>) {
  if (!emailEnabled() || !data.tokens?.length) return;
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const {
    data: [order],
  } = await query.graph({
    entity: "order",
    fields: ["id", "display_id", "email", "shipping_address.first_name"],
    filters: { id: data.order_id },
  });
  const ctx = await orderCajaContext(container, data.order_id);
  if (!order?.email || !ctx) {
    logger.warn(`caja-propuesta-email: pedido ${data.order_id} sin email; no se envía`);
    return;
  }
  const views = new Map((await orderCajas(container, ctx)).map((c) => [c.line_item_id, c]));
  const links = linksFrom(container);
  const cajas = data.tokens.flatMap(({ line_item_id, token }) => {
    const c = views.get(line_item_id);
    const line = ctx.items.find((i) => i.id === line_item_id);
    if (!c) return [];
    return [
      {
        name: (line?.metadata?.[CAJA_META.name] as string) || "tu peque",
        title: c.title,
        content: c.content.map(contentLine),
        url: cajaAnswerUrl(links.storefrontUrl, data.order_id, line_item_id, token),
      },
    ];
  });
  if (!cajas.length) return;
  await sendEmail(container, {
    to: order.email,
    template: "caja-propuesta",
    data: {
      ...links,
      displayId: (order.display_id as number | null) ?? order.id,
      customerName:
        (order.shipping_address as { first_name?: string | null } | null)?.first_name?.trim() ||
        null,
      cajas,
      deadline: deadlineLabel(deadline(new Date(data.proposed_at), cajaTimeConfig())),
    },
    idempotencyKey: hashKey(
      "caja-propuesta",
      `${data.order_id}/${data.proposed_at}/${data.tokens.map((t) => t.line_item_id).join(",")}`,
    ),
  });
}

export const config: SubscriberConfig = { event: CAJA_EVENTS.proposed };
