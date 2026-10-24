import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { ORDER_EMAIL_FIELDS, type OrderLike } from "../lib/emails";
import {
  adminOrderUrl,
  buildOrderReceivedShopProps,
  ntfyOrderMessage,
  orderUnits,
} from "../lib/shop-notify";
import { PETS_MODULE } from "../modules/pets";
import type PetsModuleService from "../modules/pets/service";
import { emailEnabled, linksFrom, sendEmail } from "./_email";

/**
 * Aviso de pedido nuevo a la tienda (Fase M): email a `SHOP_NOTIFY_EMAIL` (con el pedido, el
 * cliente y sus mascotas) y push por ntfy (`NTFY_URL` + `NTFY_ORDERS_TOPIC`, sin datos
 * personales). Corre en el worker; cada aviso es independiente y un fallo solo deja un aviso en el
 * log (sin datos del cliente): nunca afecta al pedido.
 * Fuentes: context7 /medusajs/medusa (subscriber `order.placed`), /websites/ntfy_sh (publish).
 */
export default async function orderPlacedShopNotify({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const to = process.env.SHOP_NOTIFY_EMAIL;
  const ntfy = {
    url: process.env.NTFY_URL,
    topic: process.env.NTFY_ORDERS_TOPIC,
    token: process.env.NTFY_TOKEN,
  };
  const wantEmail = emailEnabled() && Boolean(to);
  if (!wantEmail && !(ntfy.url && ntfy.topic)) return;

  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const {
    data: [order],
  } = await query.graph({
    entity: "order",
    fields: [...ORDER_EMAIL_FIELDS, "customer_id"],
    filters: { id: data.id },
  });
  if (!order) return;

  const pets = order.customer_id
    ? await container
        .resolve<PetsModuleService>(PETS_MODULE)
        .listPets({ customer_id: order.customer_id }, { order: { created_at: "ASC" }, take: 50 })
    : [];
  // Admin: `ADMIN_URL` (prod: https://admin.<dominio>); en local, el propio backend (:9000/app).
  const adminUrl = adminOrderUrl(process.env.ADMIN_URL || process.env.MEDUSA_BACKEND_URL, order.id);
  const props = buildOrderReceivedShopProps(
    order as unknown as OrderLike,
    pets,
    linksFrom(container),
    adminUrl,
  );

  const tasks: Promise<void>[] = [];
  if (wantEmail) {
    tasks.push(
      sendEmail(container, {
        to: to!,
        template: "order-received-shop",
        data: props,
        idempotencyKey: `order-received-shop/${order.id}`,
      }),
    );
  }
  const msg = ntfyOrderMessage(
    ntfy,
    {
      displayId: props.displayId,
      total: props.total,
      currencyCode: props.currencyCode,
      units: orderUnits(props),
    },
    adminUrl,
  );
  if (msg) {
    tasks.push(
      fetch(msg.url, {
        method: "POST",
        headers: msg.headers,
        body: msg.body,
        signal: AbortSignal.timeout(10_000),
      })
        .then((r) => {
          if (!r.ok) logger.warn(`ntfy: aviso del pedido ${order.id} rechazado (${r.status})`);
        })
        .catch((e: unknown) => {
          logger.warn(
            `ntfy: no se pudo avisar del pedido ${order.id}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }),
    );
  }
  await Promise.all(tasks);
}

export const config: SubscriberConfig = { event: "order.placed" };
