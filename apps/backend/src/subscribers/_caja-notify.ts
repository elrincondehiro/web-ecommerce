import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { CajaTiendaProps } from "emails";
import { CAJA_META } from "../lib/line-data";
import { adminOrderUrl } from "../lib/shop-notify";
import { emailEnabled, linksFrom, sendEmail } from "./_email";

/**
 * Avisos INTERNOS de la caja de snacks (Fase CS-4): email a `SHOP_NOTIFY_EMAIL` y push ntfy
 * (`NTFY_URL` + `NTFY_ORDERS_TOPIC`). El push no lleva datos personales: solo el nº de pedido y
 * qué ha pasado (el nombre de la mascota y el motivo van solo en el email de la tienda). El guion
 * bajo: no es un subscriber.
 */

const NTFY: Record<CajaTiendaProps["kind"], { title: string; tags: string; priority: string }> = {
  rechazada: { title: "Caja rechazada", tags: "x", priority: "high" },
  aceptada: { title: "Caja aceptada", tags: "white_check_mark", priority: "default" },
  aceptada_auto: {
    title: "Caja aceptada (24 h)",
    tags: "hourglass",
    priority: "default",
  },
  sin_preparar: { title: "Caja sin preparar (48 h)", tags: "warning", priority: "high" },
};

export async function notifyShopCaja(
  container: MedusaContainer,
  args: {
    kind: CajaTiendaProps["kind"];
    order_id: string;
    line_item_id: string;
    motivo?: string | null;
    readyToShip?: boolean;
    /** Parte variable de la clave de idempotencia (un aviso por caja y suceso). */
    key: string;
  },
): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const to = process.env.SHOP_NOTIFY_EMAIL;
  const ntfy = {
    url: process.env.NTFY_URL,
    topic: process.env.NTFY_ORDERS_TOPIC,
    token: process.env.NTFY_TOKEN,
  };
  const wantEmail = emailEnabled() && Boolean(to);
  const wantPush = Boolean(ntfy.url && ntfy.topic && /^https?:\/\//.test(ntfy.url));
  if (!wantEmail && !wantPush) return;

  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const {
    data: [order],
  } = await query.graph({
    entity: "order",
    fields: ["id", "display_id", "items.id", "items.metadata"],
    filters: { id: args.order_id },
  });
  if (!order) return;
  const line = ((order.items ?? []) as ({ id: string; metadata?: unknown } | null)[]).find(
    (i) => i?.id === args.line_item_id,
  );
  const name =
    ((line?.metadata as Record<string, unknown> | undefined)?.[CAJA_META.name] as string) ||
    "su peque";
  const adminUrl = adminOrderUrl(process.env.ADMIN_URL || process.env.MEDUSA_BACKEND_URL, order.id);
  const displayId = (order.display_id as number | null) ?? order.id;

  const tasks: Promise<unknown>[] = [];
  if (wantEmail) {
    tasks.push(
      sendEmail(container, {
        to: to!,
        template: "caja-tienda",
        data: {
          ...linksFrom(container),
          kind: args.kind,
          displayId,
          name,
          motivo: args.motivo ?? null,
          readyToShip: args.readyToShip ?? false,
          adminOrderUrl: adminUrl,
        },
        idempotencyKey: `caja-tienda/${args.kind}/${args.key}`,
      }),
    );
  }
  if (wantPush) {
    const n = NTFY[args.kind];
    const headers: Record<string, string> = {
      Title: `${n.title} - pedido n. ${displayId}`,
      Priority: n.priority,
      Tags: n.tags,
    };
    if (adminUrl) headers.Click = adminUrl;
    if (ntfy.token) headers.Authorization = `Bearer ${ntfy.token}`;
    const body = [
      `Pedido n.º ${displayId}`,
      n.title,
      ...(args.readyToShip ? ["Todas aceptadas: listo para enviar"] : []),
    ].join(" · ");
    tasks.push(
      fetch(`${ntfy.url!.replace(/\/+$/, "")}/${encodeURIComponent(ntfy.topic!)}`, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(10_000),
      })
        .then((r) => {
          if (!r.ok) logger.warn(`ntfy: aviso de caja de ${order.id} rechazado (${r.status})`);
        })
        .catch((e: unknown) =>
          logger.warn(
            `ntfy: no se pudo avisar de la caja de ${order.id}: ${e instanceof Error ? e.message : String(e)}`,
          ),
        ),
    );
  }
  await Promise.all(tasks);
}
