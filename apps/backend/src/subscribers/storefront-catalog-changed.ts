import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { CATALOG_EVENTS, onChange } from "../lib/storefront-publish";
import { STOREFRONT_PUBLISH_MODULE } from "../modules/storefront-publish";
import type StorefrontPublishModuleService from "../modules/storefront-publish/service";

/**
 * Un cambio de catálogo (producto, foto, categoría, colección, etiqueta, opción u oferta): abre o
 * alarga la espera para publicar la tienda (rebuild del storefront, fase 13). Solo marca; el
 * build lo lanza el homelab al preguntar (`GET /hooks/storefront-rebuild`).
 */
export default async function storefrontCatalogChanged({ container }: SubscriberArgs) {
  await container
    .resolve<StorefrontPublishModuleService>(STOREFRONT_PUBLISH_MODULE)
    .update((s) => onChange(s, new Date()));
}

export const config: SubscriberConfig = { event: [...CATALOG_EVENTS] };
