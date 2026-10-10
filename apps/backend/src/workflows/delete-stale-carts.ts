import type { ICartModuleService } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import {
  createStep,
  createWorkflow,
  parallelize,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { removeRemoteLinkStep } from "@medusajs/medusa/core-flows";

/**
 * Borrado SUAVE de carritos caducados (fase 10-4). Los elige `lib/stale-carts.ts`; este
 * workflow solo los borra. `softDeleteCarts` pone `deleted_at` en el carrito y, en cascada, en
 * sus líneas, métodos de envío y direcciones (modelo `Cart` de @medusajs/cart 2.21.2). Los
 * enlaces con otros módulos (promociones, cobro) se quitan con `removeRemoteLinkStep`, también
 * suave. Si algo falla, cada paso se deshace (`restoreCarts` / `link.restore`). Para volver
 * atrás a mano: `restoreCarts(ids)` (ver docs/fases/fase10.md §4.7).
 * Patrón de `deleteProductsWorkflow` (@medusajs/core-flows 2.21.2). Fuente: context7
 * /medusajs/medusa (createStep con compensación, softDelete/restore del service factory).
 */
export const softDeleteCartsStep = createStep(
  "soft-delete-carts",
  async (ids: string[], { container }) => {
    const cartModule = container.resolve<ICartModuleService>(Modules.CART);
    await cartModule.softDeleteCarts(ids);
    return new StepResponse(ids, ids);
  },
  async (ids, { container }) => {
    if (!ids?.length) return;
    const cartModule = container.resolve<ICartModuleService>(Modules.CART);
    await cartModule.restoreCarts(ids);
  },
);

export const deleteStaleCartsWorkflow = createWorkflow(
  "delete-stale-carts",
  (input: { ids: string[] }) => {
    const [, deleted] = parallelize(
      removeRemoteLinkStep({ [Modules.CART]: { cart_id: input.ids } }).config({
        name: "remove-stale-cart-links",
      }),
      softDeleteCartsStep(input.ids),
    );
    return new WorkflowResponse(deleted);
  },
);
