import type { MedusaContainer } from "@medusajs/framework/types";
import {
  ComputedActions,
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { CODE_MESSAGES, customerCodes, normalizeCode } from "../../lib/codes";

/**
 * Pasos de los códigos descuento (Fase P). Medusa 2.21.2 responde 200 SIN aplicar un código
 * caducado, agotado o ya usado por el cliente (spike P-0): antes de tocar el carrito se calcula
 * en seco con `computeActions` y, si no daría descuento, se rechaza con un mensaje claro.
 */

const query = (c: unknown) => (c as MedusaContainer).resolve(ContainerRegistrationKeys.QUERY);

const CART_FIELDS = [
  "id",
  "currency_code",
  "email",
  "customer_id",
  "completed_at",
  "region_id",
  "region.id",
  // Sin un total del carrito, Query no calcula los de las líneas (subtotal, original_total).
  "total",
  "item_total",
  "customer.id",
  "customer.has_account",
  "customer.groups.id",
  "promotions.code",
  "items.id",
  "items.quantity",
  "items.subtotal",
  "items.original_total",
  "items.is_discountable",
  "items.product_id",
  "items.variant_id",
  "items.product.id",
  "items.product.collection_id",
  "items.product.categories.id",
  "items.product.tags.id",
  "items.product.type_id",
];

type CartRow = {
  customer_id?: string | null;
  completed_at?: unknown;
  customer?: { has_account?: boolean | null } | null;
  promotions?: ({ code?: string | null } | null)[] | null;
  items?: Record<string, unknown>[] | null;
};

/** Carrito del cliente con cuenta, sin completar; el código existe y daría descuento. */
export const validateCodeStep = createStep(
  "validate-discount-code",
  async (input: { cart_id: string; customer_id: string; code: string }, { container }) => {
    const code = normalizeCode(input.code);
    if (!code) throw new MedusaError(MedusaError.Types.INVALID_DATA, CODE_MESSAGES.invalid);
    const { data } = await query(container).graph({
      entity: "cart",
      fields: CART_FIELDS,
      filters: { id: input.cart_id },
    });
    const cart = data[0] as unknown as CartRow | undefined;
    if (!cart || cart.customer_id !== input.customer_id) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Carrito no encontrado");
    }
    if (cart.completed_at) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "El carrito ya está completado");
    }
    if (!cart.customer?.has_account) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, CODE_MESSAGES.account);
    }
    const promotion = (container as MedusaContainer).resolve(Modules.PROMOTION);
    const [found] = await promotion.listPromotions(
      { code, is_automatic: false },
      { select: ["id", "code", "status"] },
    );
    if (!found || found.status !== "active") {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, CODE_MESSAGES.invalid);
    }
    // En seco y SOLO (sin ajustes previos): ¿daría descuento a este carrito y este cliente?
    const items = (cart.items ?? []).map((i) => ({ ...i, adjustments: [] }));
    const actions = (await promotion.computeActions([code], {
      ...(cart as Record<string, unknown>),
      items,
      shipping_methods: [],
    } as never)) as { action: string; code?: string }[];
    const applies = actions.some(
      (a) => a.action === ComputedActions.ADD_ITEM_ADJUSTMENT && a.code === code,
    );
    if (!applies) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, CODE_MESSAGES.notApplied);
    // Un código por pedido: el anterior (si lo hay y es otro) se sustituye.
    const previous = customerCodes(cart.promotions).filter((c) => c !== code);
    return new StepResponse({ code, previous });
  },
);

/** Códigos de cliente del carrito (para quitarlos), comprobando que el carrito es suyo. */
export const findCartCodesStep = createStep(
  "find-cart-discount-codes",
  async (input: { cart_id: string; customer_id: string }, { container }) => {
    const { data } = await query(container).graph({
      entity: "cart",
      fields: ["id", "customer_id", "completed_at", "promotions.code"],
      filters: { id: input.cart_id },
    });
    const cart = data[0] as unknown as CartRow | undefined;
    if (!cart || cart.customer_id !== input.customer_id) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Carrito no encontrado");
    }
    return new StepResponse(customerCodes(cart.promotions));
  },
);
