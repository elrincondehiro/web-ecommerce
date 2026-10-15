import type { MedusaContainer } from "@medusajs/framework/types";
import { ComputedActions, ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { customerCodes, itemsAfterCode } from "./codes";
import { toNumber } from "./numeric";
import { maxRedeemable, roundCents } from "./points";

/**
 * Productos y envío que quedan para usar puntos en un carrito (Fase P): el descuento del código
 * se calcula SOLO (sin puntos) con `computeActions` del módulo de promociones, en seco (no toca
 * el carrito ni registra usos). Es el descuento máximo del código: si Medusa aplica antes los
 * puntos (spike P-0), el código descuenta menos. Fuente: código de @medusajs/promotion 2.21.2
 * (`computeActions(codes, context)`; contexto = carrito con `items.*`, `customer`, `region`).
 */
const CART_FIELDS = [
  "id",
  "currency_code",
  "email",
  "customer_id",
  "region_id",
  "original_item_total",
  // Sin un total del carrito, Query no calcula los de las líneas (subtotal, original_total).
  "total",
  "item_total",
  "shipping_total",
  "promotions.code",
  "region.id",
  "customer.id",
  "customer.groups.id",
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

export type PointsRoom = {
  /** Productos tras el código (sin puntos). */
  items: number;
  shipping: number;
  code: string | null;
  /** Descuento del código solo (sin puntos). */
  codeAlone: number;
  customerId: string | null;
  currency: string;
};

export async function pointsRoom(
  container: MedusaContainer,
  cartId: string,
): Promise<PointsRoom | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "cart",
    fields: CART_FIELDS,
    filters: { id: cartId },
  });
  const cart = data[0] as unknown as
    | {
        currency_code?: string | null;
        customer_id?: string | null;
        original_item_total?: unknown;
        shipping_total?: unknown;
        promotions?: ({ code?: string | null } | null)[] | null;
        items?: Record<string, unknown>[] | null;
      }
    | undefined;
  if (!cart) return null;
  const original = toNumber(cart.original_item_total as never);
  const [code] = customerCodes(cart.promotions);
  let codeAlone = 0;
  if (code) {
    const promotion = container.resolve(Modules.PROMOTION);
    // Contexto sin ajustes previos: así el código se calcula solo, sin los puntos.
    const items = (cart.items ?? []).map((i) => ({ ...i, adjustments: [] }));
    const actions = await promotion.computeActions([code], {
      ...(cart as Record<string, unknown>),
      items,
      shipping_methods: [],
    } as never);
    for (const a of actions as { action: string; code?: string; amount?: unknown }[]) {
      if (a.action === ComputedActions.ADD_ITEM_ADJUSTMENT && a.code === code) {
        codeAlone += toNumber(a.amount as never);
      }
    }
  }
  codeAlone = roundCents(codeAlone);
  return {
    items: itemsAfterCode(original, codeAlone),
    shipping: toNumber(cart.shipping_total as never),
    code: code ?? null,
    codeAlone,
    customerId: cart.customer_id ?? null,
    currency: cart.currency_code ?? "eur",
  };
}

/** Máximo de puntos usable en el carrito con este saldo (tras el código, ≥ 0,50 € por pagar). */
export function maxForRoom(balance: number, room: PointsRoom): number {
  return maxRedeemable(balance, room.items, room.shipping);
}
