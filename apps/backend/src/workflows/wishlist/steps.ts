import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { randomBytes } from "node:crypto";
import type { MedusaContainer } from "@medusajs/framework/types";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { isDiscontinued } from "../../lib/descatalogado";
import { WISHLIST_MODULE } from "../../modules/wishlist";
import type WishlistModuleService from "../../modules/wishlist/service";

/**
 * Pasos de la lista de deseos (Fase L-1). Patrón de la guía oficial `plugins/guides/wishlist`
 * (context7 /medusajs/medusa): cada paso que escribe tiene compensación.
 */

export type WishlistItemInput = {
  product_id: string;
  variant_id: string | null;
  /** Canales de la publishable key de la petición. */
  sales_channel_ids: string[];
};

/** Producto publicado, del canal de la tienda, no descatalogado y (si hay) con esa variante. */
export const validateWishlistProductStep = createStep(
  "validate-wishlist-product",
  async (input: WishlistItemInput, { container }) => {
    const query = (container as MedusaContainer).resolve(ContainerRegistrationKeys.QUERY);
    const { data } = await query.graph({
      entity: "product",
      fields: ["id", "status", "metadata", "sales_channels.id", "variants.id"],
      filters: { id: input.product_id },
    });
    const product = data[0];
    const inChannel =
      !input.sales_channel_ids.length ||
      (product?.sales_channels ?? []).some((sc) => sc && input.sales_channel_ids.includes(sc.id));
    if (!product || product.status !== "published" || !inChannel) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Producto no encontrado");
    }
    if (isDiscontinued(product.metadata)) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Este producto está descatalogado.");
    }
    if (input.variant_id && !(product.variants ?? []).some((v) => v?.id === input.variant_id)) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "La variante no es de este producto");
    }
  },
);

/** La lista del cliente; la crea si no existe (compensación: borrarla si se creó aquí). */
export const getOrCreateWishlistStep = createStep(
  "get-or-create-wishlist",
  async (input: { customer_id: string }, { container }) => {
    const service = container.resolve<WishlistModuleService>(WISHLIST_MODULE);
    const [existing] = await service.listWishlists({ customer_id: input.customer_id });
    if (existing) return new StepResponse(existing, null);
    const created = await service.createWishlists({ customer_id: input.customer_id });
    return new StepResponse(created, created.id);
  },
  async (createdId, { container }) => {
    if (!createdId) return;
    await container.resolve<WishlistModuleService>(WISHLIST_MODULE).deleteWishlists(createdId);
  },
);

/**
 * Añade el producto si no estaba (idempotente: devuelve `created: false` si ya estaba).
 * Compensación: borrar solo lo creado aquí.
 */
export const addWishlistItemStep = createStep(
  "add-wishlist-item",
  async (
    input: { wishlist_id: string; product_id: string; variant_id: string | null },
    { container },
  ) => {
    const service = container.resolve<WishlistModuleService>(WISHLIST_MODULE);
    const [existing] = await service.listWishlistItems({
      wishlist_id: input.wishlist_id,
      product_id: input.product_id,
      variant_id: input.variant_id,
    });
    if (existing) return new StepResponse({ item: existing, created: false }, null);
    const item = await service.createWishlistItems({
      wishlist_id: input.wishlist_id,
      product_id: input.product_id,
      variant_id: input.variant_id,
    });
    return new StepResponse({ item, created: true }, item.id);
  },
  async (createdId, { container }) => {
    if (!createdId) return;
    await container.resolve<WishlistModuleService>(WISHLIST_MODULE).deleteWishlistItems(createdId);
  },
);

/**
 * Quita un producto de la lista del cliente (borrado suave). Si no existe o es de otra lista no
 * hace nada (misma respuesta: no revela listas ajenas). Compensación: restaurarlo.
 */
export const removeWishlistItemStep = createStep(
  "remove-wishlist-item",
  async (input: { customer_id: string; item_id: string }, { container }) => {
    const service = container.resolve<WishlistModuleService>(WISHLIST_MODULE);
    const [wishlist] = await service.listWishlists({ customer_id: input.customer_id });
    if (!wishlist) return new StepResponse({ removed: false }, null);
    const [item] = await service.listWishlistItems({
      id: input.item_id,
      wishlist_id: wishlist.id,
    });
    if (!item) return new StepResponse({ removed: false }, null);
    await service.softDeleteWishlistItems(item.id);
    return new StepResponse({ removed: true }, item.id);
  },
  async (removedId, { container }) => {
    if (!removedId) return;
    await container.resolve<WishlistModuleService>(WISHLIST_MODULE).restoreWishlistItems(removedId);
  },
);

/** Token del enlace público (L-1b): 32 bytes aleatorios en base64url (43 caracteres). */
export const SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export function newShareToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Comparte la lista (L-1b): si ya tiene token, lo devuelve (idempotente); si no, genera uno.
 * Compensación: dejar el token como estaba.
 */
export const shareWishlistStep = createStep(
  "share-wishlist",
  async (input: { wishlist_id: string; share_token: string | null }, { container }) => {
    if (input.share_token) return new StepResponse({ token: input.share_token }, null);
    const service = container.resolve<WishlistModuleService>(WISHLIST_MODULE);
    const token = newShareToken();
    await service.updateWishlists({ id: input.wishlist_id, share_token: token });
    return new StepResponse({ token }, input.wishlist_id);
  },
  async (wishlistId, { container }) => {
    if (!wishlistId) return;
    await container
      .resolve<WishlistModuleService>(WISHLIST_MODULE)
      .updateWishlists({ id: wishlistId, share_token: null });
  },
);

/** Deja de compartir (L-1b): token a nulo; el enlace anterior da 404. Compensación: restaurarlo. */
export const unshareWishlistStep = createStep(
  "unshare-wishlist",
  async (input: { customer_id: string }, { container }) => {
    const service = container.resolve<WishlistModuleService>(WISHLIST_MODULE);
    const [wishlist] = await service.listWishlists({ customer_id: input.customer_id });
    if (!wishlist?.share_token) return new StepResponse(undefined, null);
    await service.updateWishlists({ id: wishlist.id, share_token: null });
    return new StepResponse(undefined, { id: wishlist.id, token: wishlist.share_token });
  },
  async (prev, { container }) => {
    if (!prev) return;
    await container
      .resolve<WishlistModuleService>(WISHLIST_MODULE)
      .updateWishlists({ id: prev.id, share_token: prev.token });
  },
);
