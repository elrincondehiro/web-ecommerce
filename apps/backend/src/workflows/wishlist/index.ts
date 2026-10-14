import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import {
  addWishlistItemStep,
  getOrCreateWishlistStep,
  removeWishlistItemStep,
  shareWishlistStep,
  unshareWishlistStep,
  validateWishlistProductStep,
  type WishlistItemInput,
} from "./steps";

/** Guardar un producto (y opcionalmente su variante) en la lista del cliente (Fase L-1). */
export const addToWishlistWorkflow = createWorkflow(
  "add-to-wishlist",
  (input: WishlistItemInput & { customer_id: string }) => {
    validateWishlistProductStep(input);
    const wishlist = getOrCreateWishlistStep({ customer_id: input.customer_id });
    const result = addWishlistItemStep({
      wishlist_id: wishlist.id,
      product_id: input.product_id,
      variant_id: input.variant_id,
    });
    return new WorkflowResponse(result);
  },
);

/** Quitar un producto de la lista del cliente (Fase L-1). */
export const removeFromWishlistWorkflow = createWorkflow(
  "remove-from-wishlist",
  (input: { customer_id: string; item_id: string }) => {
    return new WorkflowResponse(removeWishlistItemStep(input));
  },
);

/** Compartir la lista por enlace (L-1b): crea la lista si no existe; idempotente. */
export const shareWishlistWorkflow = createWorkflow(
  "share-wishlist",
  (input: { customer_id: string }) => {
    const wishlist = getOrCreateWishlistStep({ customer_id: input.customer_id });
    const result = shareWishlistStep({
      wishlist_id: wishlist.id,
      share_token: wishlist.share_token,
    });
    return new WorkflowResponse(result);
  },
);

/** Dejar de compartir (L-1b): el enlace anterior deja de funcionar. */
export const unshareWishlistWorkflow = createWorkflow(
  "unshare-wishlist",
  (input: { customer_id: string }) => {
    unshareWishlistStep(input);
    return new WorkflowResponse({ shared: false });
  },
);
