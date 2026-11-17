import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import type { ICartModuleService } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { WISHLIST_MODULE } from "../modules/wishlist";
import type WishlistModuleService from "../modules/wishlist/service";
import { deleteStaleCartsWorkflow } from "../workflows/delete-stale-carts";

/**
 * Baja de la cuenta (fase 13): al borrar el cliente se borran (suave) su lista de deseos (con sus
 * productos) y sus carritos sin completar (llevan email y direcciones). Los demás datos los
 * borran sus propios subscribers (mascotas, consentimientos, avisos de stock). Evento
 * `customer.deleted` (`{ id }`).
 */
export default async function accountCustomerDeleted({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  try {
    const wishlists = container.resolve<WishlistModuleService>(WISHLIST_MODULE);
    const lists = await wishlists.listWishlists({ customer_id: data.id });
    if (lists.length) await wishlists.softDeleteWishlists(lists.map((l) => l.id));
  } catch (e) {
    logger.warn(`wishlist: no se pudo borrar la lista del cliente ${data.id}: ${String(e)}`);
  }
  try {
    const carts = await container
      .resolve<ICartModuleService>(Modules.CART)
      .listCarts({ customer_id: data.id, completed_at: null } as never, { select: ["id"] });
    if (carts.length) {
      await deleteStaleCartsWorkflow(container).run({ input: { ids: carts.map((c) => c.id) } });
    }
  } catch (e) {
    logger.warn(`carts: no se pudieron borrar los carritos del cliente ${data.id}: ${String(e)}`);
  }
}

export const config: SubscriberConfig = { event: "customer.deleted" };
