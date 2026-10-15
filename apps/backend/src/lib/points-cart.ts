import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { POINTS_MODULE } from "../modules/points";
import type PointsModuleService from "../modules/points/service";
import { codeDiscount } from "./codes";
import { accrualBase, pointsDiscount, pointsFor, roundCents } from "./points";
import { maxForRoom, pointsRoom } from "./points-room";

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
  /** Código descuento aplicado (Fase P) y su descuento real en el carrito. */
  code: string | null;
  code_amount: number;
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
  const code = codeDiscount(cart.items);
  if (!customerId || cart.customer_id !== customerId) {
    return { earn, applied: 0, balance: null, max: null, code: null, code_amount: 0 };
  }
  const service = container.resolve<PointsModuleService>(POINTS_MODULE);
  const account = await service.findAccount(customerId);
  const balance = account ? await service.getBalance(account.id) : 0;
  // Mismo tope que applyPointsWorkflow (validateRedeemStep): productos tras el código, sin puntos.
  const room = await pointsRoom(container, cartId);
  return {
    earn,
    applied: roundCents(applied),
    balance,
    max: room ? maxForRoom(balance, room) : 0,
    code: code.code,
    code_amount: code.amount,
  };
}
