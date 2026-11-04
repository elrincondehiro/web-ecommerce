import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { CAJA_SIN_PREPARAR } from "./caja";
import { cajaTimeConfig, needsAlert } from "./caja-time";
import { CAJA_MODULE } from "../modules/caja";
import type CajaModuleService from "../modules/caja/service";
import { autoAcceptCajaWorkflow } from "../workflows/caja/respuesta";
import { notifyShopCaja } from "../subscribers/_caja-notify";

/**
 * Job de la caja de snacks (Fase CS-4, `CAJA_JOBS_CRON`, por defecto cada 15 min):
 * 1. Aceptación automática: `propuesta` con más de `CAJA_AUTOACCEPT_HOURS` → `aceptada_auto`
 *    (workflow con evento; aviso solo a la tienda).
 * 2. Aviso interno: `pendiente` o `rechazada` con ≥ `CAJA_ALERT_WORK_HOURS` laborables desde el
 *    pedido o el rechazo, y sin aviso aún → email + ntfy a la tienda y `aviso_at`.
 * Idempotente: cada caja cambia de estado o recibe aviso una sola vez.
 */
export async function processCajas(container: MedusaContainer, now = new Date()) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const service = container.resolve<CajaModuleService>(CAJA_MODULE);
  const cfg = cajaTimeConfig();

  const before = new Date(now.getTime() - cfg.autoAcceptHours * 60 * 60 * 1000);
  const proposed = await service.listCajas({ estado: "propuesta" });
  let accepted = 0;
  for (const c of proposed) {
    if (!c.propuesta_at || new Date(c.propuesta_at) > before) continue;
    try {
      const { result } = await autoAcceptCajaWorkflow(container).run({
        input: { id: c.id, before },
      });
      if (result) accepted++;
    } catch (e) {
      logger.error(`caja: no se pudo aceptar ${c.id}: ${e instanceof Error ? e.message : e}`);
    }
  }

  const waiting = await service.listCajas({ estado: [...CAJA_SIN_PREPARAR], aviso_at: null });
  let alerts = 0;
  for (const c of waiting) {
    // Desde el rechazo o, si no, desde que se hizo el pedido (creación de la fila)
    const since = new Date(
      c.estado === "rechazada" && c.respondida_at ? c.respondida_at : c.created_at,
    );
    if (!needsAlert(since, now, cfg)) continue;
    await service.updateCajas({ id: c.id, aviso_at: now });
    await notifyShopCaja(container, {
      kind: "sin_preparar",
      order_id: c.order_id,
      line_item_id: c.line_item_id,
      key: `${c.id}/${since.toISOString()}`,
    });
    alerts++;
  }
  if (accepted || alerts) {
    logger.info(`caja: ${accepted} aceptada(s) automáticamente, ${alerts} aviso(s) de 48 h`);
  }
  return { accepted, alerts };
}
