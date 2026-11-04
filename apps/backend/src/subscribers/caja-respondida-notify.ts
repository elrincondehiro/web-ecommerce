import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { CAJA_MODULE } from "../modules/caja";
import type CajaModuleService from "../modules/caja/service";
import { CAJA_EVENTS, allAccepted } from "../workflows/caja/respuesta";
import { notifyShopCaja } from "./_caja-notify";

/**
 * Respuesta del cliente o aceptación automática (Fase CS-4): aviso a la tienda (email + ntfy).
 * El motivo del rechazo se lee de la caja (no viaja en el evento).
 */
export default async function cajaRespondidaNotify({
  event: { data },
  container,
}: SubscriberArgs<{
  order_id: string;
  line_item_id: string;
  estado: "aceptada" | "aceptada_auto" | "rechazada";
}>) {
  if (!data?.line_item_id) return;
  const [row] = await container
    .resolve<CajaModuleService>(CAJA_MODULE)
    .listCajas({ line_item_id: data.line_item_id });
  if (!row) return;
  await notifyShopCaja(container, {
    kind: data.estado,
    order_id: data.order_id,
    line_item_id: data.line_item_id,
    motivo: data.estado === "rechazada" ? row.motivo_rechazo : null,
    readyToShip: data.estado !== "rechazada" && (await allAccepted(container, data.order_id)),
    key: `${row.id}/${row.respondida_at ? new Date(row.respondida_at).toISOString() : "x"}`,
  });
}

export const config: SubscriberConfig = { event: CAJA_EVENTS.answered };
