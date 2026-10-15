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
import { findCartCodesStep, validateCodeStep } from "./steps";

/**
 * Códigos descuento (Fase P). Un código por pedido, solo con cuenta. Mismo lock que los puntos
 * (`points:<cliente>`): el tope de puntos depende del código. Tras aplicar o quitar se refresca
 * el pago (`force_refresh_payment_collection`, lección del spike L-0). El recorte de los puntos
 * que ya no caben lo hace la ruta después (aplicar puntos usa el mismo lock).
 */
const lockKey = (customerId: string) => `points:${customerId}`;

export const applyCodeWorkflow = createWorkflow(
  "apply-discount-code",
  (input: { cart_id: string; customer_id: string; code: string }) => {
    const key = transform({ input }, ({ input }) => lockKey(input.customer_id));
    acquireLockStep({ key, timeout: 5, ttl: 30 });
    const check = validateCodeStep(input);
    when({ check }, ({ check }) => check.previous.length > 0).then(() => {
      updateCartPromotionsWorkflow
        .runAsStep({
          input: {
            cart_id: input.cart_id,
            promo_codes: check.previous,
            action: PromotionActions.REMOVE,
          },
        })
        .config({ name: "remove-previous-discount-code" });
    });
    const add = transform({ check }, ({ check }) => [check.code]);
    updateCartPromotionsWorkflow.runAsStep({
      input: {
        cart_id: input.cart_id,
        promo_codes: add,
        action: PromotionActions.ADD,
        force_refresh_payment_collection: true,
      },
    });
    releaseLockStep({ key });
    return new WorkflowResponse({ code: check.code });
  },
);

export const removeCodeWorkflow = createWorkflow(
  "remove-discount-code",
  (input: { cart_id: string; customer_id: string }) => {
    const codes = findCartCodesStep(input);
    when({ codes }, ({ codes }) => codes.length > 0).then(() => {
      updateCartPromotionsWorkflow.runAsStep({
        input: {
          cart_id: input.cart_id,
          promo_codes: codes,
          action: PromotionActions.REMOVE,
          force_refresh_payment_collection: true,
        },
      });
    });
    return new WorkflowResponse({ removed: codes });
  },
);
