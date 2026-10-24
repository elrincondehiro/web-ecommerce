import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, FeatureFlag, Modules } from "@medusajs/framework/utils";

/**
 * Vacía la caché de Medusa (`MEDUSA_FF_CACHING`, Caching Module con Redis) al terminar un script
 * que escribe catálogo o stock (Fase R-2, docs/fases/faseR-rendimiento.md).
 *
 * La caché se invalida sola escuchando el bus de eventos, pero solo en el proceso del servidor:
 * los eventos que emite un `medusa exec` no le llegan, y sin esto la tienda seguiría mostrando
 * el stock o el precio de antes hasta que caduque la entrada (`MEDUSA_CACHE_TTL`). Medido en
 * 2.21.2: con `updateInventoryLevelsWorkflow` desde un script la Store API seguía devolviendo el
 * stock anterior; desde el Admin se veía al instante.
 * `clear({ tags: ["*"] })` borra todas las claves del proveedor (caching-redis `flush`). Sin
 * el flag no hay nada que vaciar.
 */
export async function clearMedusaCache(container: MedusaContainer): Promise<void> {
  if (!FeatureFlag.isFeatureEnabled("caching")) return;
  const caching = container.resolve(Modules.CACHING, { allowUnregistered: true });
  if (!caching) return;
  await caching.clear({ tags: ["*"] });
  container.resolve(ContainerRegistrationKeys.LOGGER).info("Caché de Medusa vaciada.");
}
