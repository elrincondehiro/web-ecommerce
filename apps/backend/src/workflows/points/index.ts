import { PromotionActions } from "@medusajs/framework/utils";
import {
  createWorkflow,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import {
  acquireLockStep,
  releaseLockStep,
  updateCartPromotionsWorkflow,
} from "@medusajs/medusa/core-flows";
import {
  createMovementStep,
  createPointsPromotionStep,
  deletePointsPromotionsStep,
  findCartPointsPromotionStep,
  validateRedeemStep,
  type Movement,
} from "./steps";

/**
 * Workflows del programa de puntos (Fase L-2). Fuentes: context7 /medusajs/medusa (tutorial
 * `loyalty-points`: aplicar/quitar con lock; `workflows/locks`); spike L-0 (§6.1): aplicar la
 * promoción con `force_refresh_payment_collection` para que el importe de Stripe se recalcule.
 */

const lockKey = (customerId: string) => `points:${customerId}`;

/** Usar puntos en el carrito: sustituye la promoción de puntos que hubiera. Lock por cliente. */
export const applyPointsWorkflow = createWorkflow(
  "apply-points-to-cart",
  (input: { cart_id: string; customer_id: string; amount: number }) => {
    const key = transform({ input }, ({ input }) => lockKey(input.customer_id));
    acquireLockStep({ key, timeout: 5, ttl: 30 });
    const check = validateRedeemStep(input);
    const promo = createPointsPromotionStep({
      cart_id: input.cart_id,
      customer_id: input.customer_id,
      amount: check.amount,
      currency_code: check.currency_code,
    });
    const codes = transform({ check, promo }, ({ check, promo }) => ({
      add: [promo.code],
      remove: check.previous ? [check.previous.code] : [],
      removeIds: check.previous ? [check.previous.id] : [],
    }));
    when({ codes }, ({ codes }) => codes.remove.length > 0).then(() => {
      updateCartPromotionsWorkflow
        .runAsStep({
          input: {
            cart_id: input.cart_id,
            promo_codes: codes.remove,
            action: PromotionActions.REMOVE,
          },
        })
        .config({ name: "remove-previous-points-promotion" });
    });
    updateCartPromotionsWorkflow.runAsStep({
      input: {
        cart_id: input.cart_id,
        promo_codes: codes.add,
        action: PromotionActions.ADD,
        force_refresh_payment_collection: true,
      },
    });
    deletePointsPromotionsStep(codes.removeIds);
    releaseLockStep({ key });
    return new WorkflowResponse({ amount: check.amount, code: promo.code });
  },
);

/** Quitar los puntos del carrito (y borrar su promoción). Sin promoción de puntos: no hace nada. */
export const removePointsWorkflow = createWorkflow(
  "remove-points-from-cart",
  (input: { cart_id: string; customer_id: string }) => {
    const promo = findCartPointsPromotionStep(input);
    when({ promo }, ({ promo }) => !!promo).then(() => {
      const codes = transform({ promo }, ({ promo }) => [promo!.code]);
      const ids = transform({ promo }, ({ promo }) => [promo!.id]);
      updateCartPromotionsWorkflow.runAsStep({
        input: {
          cart_id: input.cart_id,
          promo_codes: codes,
          action: PromotionActions.REMOVE,
          force_refresh_payment_collection: true,
        },
      });
      deletePointsPromotionsStep(ids);
    });
    return new WorkflowResponse({ removed: true });
  },
);

/**
 * Movimiento de puntos idempotente (abono del pedido, canje, devolución de lo canjeado al
 * cancelar, devolución de productos, ajuste manual). Lock por cliente: el saldo no se cruza.
 */
export const pointsMovementWorkflow = createWorkflow("points-movement", (input: Movement) => {
  const key = transform({ input }, ({ input }) => lockKey(input.customer_id));
  acquireLockStep({ key, timeout: 10, ttl: 30 });
  const result = createMovementStep(input);
  releaseLockStep({ key });
  return new WorkflowResponse(result);
});
