import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { POINTS_MODULE } from "../modules/points";
import type PointsModuleService from "../modules/points/service";
import { toNumber } from "./numeric";
import { accrualBase, maxRedeemable, pointsDiscount, pointsFor, roundCents } from "./points";

/**
 * Puntos de un carrito (Fase L-3) para el checkout: lo que generaría (`earn`, también para
 * invitados: «con una cuenta ganarías…») y, si el carrito es del cliente con sesión, su saldo,
 * el máximo que puede usar y lo ya aplicado. Las reglas son las de `lib/points.ts` (una sola
 * implementación: el storefront no las duplica).
 */
export type CartPoints = {
  earn: number;
  applied: number;
  balance: number | null;
  max: number | null;
};

const CART_FIELDS = [
  "id",
  "customer_id",
  "completed_at",
  "original_item_total",
  "item_total",
  "shipping_total",
  "items.total",
  "items.product.metadata",
  "items.adjustments.code",
  "items.adjustments.amount",
];

type CartRow = {
  customer_id?: string | null;
  original_item_total?: unknown;
  shipping_total?: unknown;
  items?: never;
};

export async function cartPoints(
  container: MedusaContainer,
  cartId: string,
  customerId: string | null,
): Promise<CartPoints | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "cart",
    fields: CART_FIELDS,
    filters: { id: cartId },
  });
  const cart = data[0] as unknown as CartRow | undefined;
  if (!cart) return null;
  const applied = pointsDiscount(cart.items).amount;
  const earn = pointsFor(accrualBase(cart.items));
  if (!customerId || cart.customer_id !== customerId) {
    return { earn, applied: 0, balance: null, max: null };
  }
  const service = container.resolve<PointsModuleService>(POINTS_MODULE);
  const account = await service.findAccount(customerId);
  const balance = account ? await service.getBalance(account.id) : 0;
  return {
    earn,
    applied: roundCents(applied),
    balance,
    // Mismo tope que applyPointsWorkflow (validateRedeemStep): sobre los productos SIN puntos.
    max: maxRedeemable(
      balance,
      toNumber(cart.original_item_total as never),
      toNumber(cart.shipping_total as never),
    ),
  };
}
