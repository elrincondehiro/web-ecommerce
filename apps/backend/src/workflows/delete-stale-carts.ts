import type { ICartModuleService } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import {
  createStep,
  createWorkflow,
  parallelize,
  StepResponse,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import {
  deleteCustomersWorkflow,
  deletePaymentSessionsWorkflow,
  removeRemoteLinkStep,
} from "@medusajs/medusa/core-flows";
import { anonymizeCustomersStep } from "./delete-account/steps";

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

export type StaleCartsInput = {
  ids: string[];
  /** Sesiones de pago de esos carritos (Stripe: el borrado cancela el PaymentIntent). */
  payment_session_ids?: string[];
  /** Líneas (solo para vaciar). */
  item_ids?: string[];
};

/**
 * Sesiones de pago (fase 13): `deletePaymentSessionsWorkflow` de Medusa llama al proveedor
 * (Stripe cancela el PaymentIntent) y falla si alguna no se puede borrar: el carrito no se toca.
 * Fuente: @medusajs/core-flows 2.22.7 (`deletePaymentSessionsStep` +
 * `validateDeletedPaymentSessionsStep`), @medusajs/payment-stripe 2.22.7 (`deletePayment`).
 */
function deleteSessions(input: StaleCartsInput) {
  const sessions = transform({ input }, ({ input }) => input.payment_session_ids ?? []);
  when({ sessions }, ({ sessions }) => sessions.length > 0).then(() => {
    deletePaymentSessionsWorkflow.runAsStep({ input: { ids: sessions } });
  });
}

export const deleteStaleCartsWorkflow = createWorkflow(
  "delete-stale-carts",
  (input: StaleCartsInput) => {
    deleteSessions(input);
    const [, deleted] = parallelize(
      removeRemoteLinkStep({ [Modules.CART]: { cart_id: input.ids } }).config({
        name: "remove-stale-cart-links",
      }),
      softDeleteCartsStep(input.ids),
    );
    return new WorkflowResponse(deleted);
  },
);

/** Vaciar (fase 13): borra (suave) las líneas y el método de envío; el carrito se queda. */
export const emptyCartsStep = createStep(
  "empty-stale-carts",
  async (input: { ids: string[]; item_ids: string[] }, { container }) => {
    const cartModule = container.resolve<ICartModuleService>(Modules.CART);
    const methods = await cartModule.listShippingMethods({ cart_id: input.ids } as never, {
      select: ["id"],
    });
    const methodIds = methods.map((m) => m.id);
    if (input.item_ids.length) await cartModule.softDeleteLineItems(input.item_ids);
    if (methodIds.length) await cartModule.softDeleteShippingMethods(methodIds);
    return new StepResponse(input.ids, { items: input.item_ids, methods: methodIds });
  },
  async (prev, { container }) => {
    if (!prev) return;
    const cartModule = container.resolve<ICartModuleService>(Modules.CART);
    if (prev.items.length) await cartModule.restoreLineItems(prev.items);
    if (prev.methods.length) await cartModule.restoreShippingMethods(prev.methods);
  },
);

export const emptyStaleCartsWorkflow = createWorkflow(
  "empty-stale-carts",
  (input: StaleCartsInput) => {
    deleteSessions(input);
    const data = transform({ input }, ({ input }) => ({
      ids: input.ids,
      item_ids: input.item_ids ?? [],
    }));
    return new WorkflowResponse(emptyCartsStep(data));
  },
);

/**
 * Clientes SIN cuenta sin pedidos ni carritos (fase 13): ficha anonimizada (paso de la baja de
 * la cuenta) y borrado suave con `deleteCustomersWorkflow` de Medusa (emite `customer.deleted`).
 */
export const deleteGuestCustomersWorkflow = createWorkflow(
  "delete-guest-customers",
  (input: { ids: string[] }) => {
    anonymizeCustomersStep(input.ids);
    deleteCustomersWorkflow.runAsStep({ input: { ids: input.ids } });
    return new WorkflowResponse(input.ids);
  },
);
