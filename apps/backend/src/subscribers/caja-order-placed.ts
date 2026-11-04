import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { isCajaLine } from "../lib/line-data";
import { CAJA_MODULE } from "../modules/caja";
import type CajaModuleService from "../modules/caja/service";

/**
 * Caja de snacks (Fase CS-3): al hacer el pedido, una fila `pendiente` por cada línea de caja
 * (el aviso de 48 h laborables y la propuesta de CS-4 parten de aquí). Idempotente: si la fila ya
 * existe (evento repetido) no se toca. Sin datos personales en el log.
 */
export default async function cajaOrderPlaced({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const {
    data: [order],
  } = await query.graph({
    entity: "order",
    fields: ["id", "items.id", "items.metadata"],
    filters: { id: data.id },
  });
  const lines = ((order?.items ?? []) as ({ id: string; metadata?: unknown } | null)[]).filter(
    (i): i is { id: string; metadata?: unknown } =>
      !!i && isCajaLine(i.metadata as Record<string, unknown> | null),
  );
  if (!lines.length) return;
  const service = container.resolve<CajaModuleService>(CAJA_MODULE);
  const existing = new Set(
    (await service.listCajas({ order_id: data.id })).map((c) => c.line_item_id),
  );
  const missing = lines.filter((l) => !existing.has(l.id));
  if (!missing.length) return;
  // Una a una: si el Admin ya la ha rellenado (fila creada por fill-caja), el índice único la
  // rechaza y se deja como está.
  let created = 0;
  for (const l of missing) {
    try {
      await service.createCajas({ order_id: data.id, line_item_id: l.id, estado: "pendiente" });
      created++;
    } catch {
      if (!(await service.listCajas({ line_item_id: l.id })).length) throw new Error("caja");
    }
  }
  if (created) {
    container.resolve("logger").info(`caja: ${created} caja(s) pendiente(s) en ${data.id}`);
  }
}

export const config: SubscriberConfig = { event: "order.placed" };
