import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { randomBytes } from "node:crypto";
import {
  POINTS_CHANNEL_WEB,
  POINTS_PROMO_PREFIX,
  isPointsPromoCode,
  maxRedeemable,
  roundCents,
} from "../../lib/points";
import { toNumber } from "../../lib/numeric";
import { POINTS_MODULE } from "../../modules/points";
import type PointsModuleService from "../../modules/points/service";

/**
 * Pasos del programa de puntos (Fase L-2). Cada paso que escribe tiene compensación. Canje como
 * promoción de un uso (spike L-0, docs/fases/faseL-deseos-puntos.md §6.1); patrón del tutorial
 * oficial `loyalty-points` (context7 /medusajs/medusa).
 */

const points = (c: unknown) => (c as MedusaContainer).resolve<PointsModuleService>(POINTS_MODULE);
const query = (c: unknown) => (c as MedusaContainer).resolve(ContainerRegistrationKeys.QUERY);

export type Movement = {
  customer_id: string;
  type: "credit" | "debit";
  amount: number;
  reference: string;
  reference_id: string;
  note?: string | null;
  /** Cargo que no puede dejar el saldo negativo: se recorta al saldo (devoluciones). */
  clampToBalance?: boolean;
  metadata?: Record<string, unknown> | null;
};

/**
 * Crea un movimiento (y la cuenta si no existe). IDEMPOTENTE: si ya hay uno con la misma
 * referencia y tipo, no hace nada (`created: false`). Importe ≤ 0 → nada.
 * Compensación: borra lo creado aquí (movimiento y, si se creó, la cuenta).
 */
type MovementUndo = { trx?: string | undefined; account?: string | undefined } | null;

export const createMovementStep = createStep(
  "create-points-movement",
  async (
    input: Movement,
    { container },
  ): Promise<StepResponse<{ created: boolean; amount: number }, MovementUndo>> => {
    const service = points(container);
    const [dup] = await service.listPointsTransactions({
      reference: input.reference,
      reference_id: input.reference_id,
      type: input.type,
    });
    if (dup) {
      return new StepResponse({ created: false, amount: toNumber(dup.amount as never) }, null);
    }
    let account = await service.findAccount(input.customer_id);
    const newAccount = !account;
    account ??= await service.createPointsAccounts({ customer_id: input.customer_id });
    let amount = roundCents(input.amount);
    if (input.clampToBalance) amount = Math.min(amount, await service.getBalance(account.id));
    if (!(amount > 0)) {
      return new StepResponse(
        { created: false, amount: 0 },
        newAccount ? { account: account.id } : null,
      );
    }
    const trx = await service.createPointsTransactions({
      account_id: account.id,
      type: input.type,
      amount,
      reference: input.reference,
      reference_id: input.reference_id,
      channel: POINTS_CHANNEL_WEB,
      note: input.note ?? null,
      metadata: input.metadata ?? null,
    });
    return new StepResponse(
      { created: true, amount },
      { trx: trx.id, account: newAccount ? account.id : undefined },
    );
  },
  async (created, { container }) => {
    if (!created) return;
    const service = points(container);
    if (created.trx) await service.deletePointsTransactions(created.trx);
    if (created.account) await service.deletePointsAccounts(created.account);
  },
);

type CartForPoints = {
  id: string;
  customer_id?: string | null;
  currency_code?: string | null;
  completed_at?: unknown;
  original_item_total?: unknown;
  shipping_total?: unknown;
  promotions?: ({ id?: string; code?: string | null } | null)[] | null;
};

/**
 * Valida el canje: carrito del cliente y sin completar; importe > 0, ≤ saldo y ≤ tope (siempre
 * quedan ≥ 0,50 € por pagar, lib/points.ts). Devuelve el importe y la promoción de puntos que
 * ya tenga el carrito (para sustituirla).
 */
export const validateRedeemStep = createStep(
  "validate-points-redeem",
  async (input: { cart_id: string; customer_id: string; amount: number }, { container }) => {
    const { data } = await query(container).graph({
      entity: "cart",
      fields: [
        "id",
        "customer_id",
        "currency_code",
        "completed_at",
        "original_item_total",
        "shipping_total",
        "promotions.id",
        "promotions.code",
      ],
      filters: { id: input.cart_id },
    });
    const cart = data[0] as CartForPoints | undefined;
    if (!cart || cart.customer_id !== input.customer_id) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Carrito no encontrado");
    }
    if (cart.completed_at) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "El carrito ya está completado");
    }
    const service = points(container);
    const account = await service.findAccount(input.customer_id);
    const balance = account ? await service.getBalance(account.id) : 0;
    const max = maxRedeemable(
      balance,
      toNumber(cart.original_item_total as never),
      toNumber(cart.shipping_total as never),
    );
    const amount = roundCents(input.amount);
    if (!(amount > 0) || amount > max) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Puedes usar como máximo ${max.toFixed(2).replace(".", ",")} € en puntos en este pedido.`,
      );
    }
    const previous = (cart.promotions ?? []).find((p) => isPointsPromoCode(p?.code)) ?? null;
    return new StepResponse({
      amount,
      currency_code: cart.currency_code ?? "eur",
      previous: previous ? { id: previous.id!, code: previous.code! } : null,
    });
  },
);

/** Promoción de canje: un uso, solo para este cliente, con IVA incluido, sobre el pedido. */
export const createPointsPromotionStep = createStep(
  "create-points-promotion",
  async (
    input: { cart_id: string; customer_id: string; amount: number; currency_code: string },
    { container },
  ) => {
    const promotionModule = (container as MedusaContainer).resolve(Modules.PROMOTION);
    // Código no adivinable (la regla customer_id ya impide que otro lo use; spike L-0).
    const code = `${POINTS_PROMO_PREFIX}${randomBytes(12).toString("hex").toUpperCase()}`;
    const [promotion] = await promotionModule.createPromotions([
      {
        code,
        type: "standard",
        status: "active",
        is_automatic: false,
        is_tax_inclusive: true,
        application_method: {
          type: "fixed",
          target_type: "order",
          allocation: "across",
          value: input.amount,
          currency_code: input.currency_code,
        },
        rules: [{ attribute: "customer_id", operator: "eq", values: [input.customer_id] }],
        campaign: {
          name: code,
          campaign_identifier: code,
          budget: { type: "usage", limit: 1 },
        },
        metadata: { points: true, cart_id: input.cart_id },
      },
    ]);
    return new StepResponse({ id: promotion!.id, code }, promotion!.id);
  },
  async (id, { container }) => {
    if (!id) return;
    await (container as MedusaContainer).resolve(Modules.PROMOTION).deletePromotions([id]);
  },
);

/** Borra promociones de puntos que ya no están en ningún carrito (sustituidas o quitadas). */
export const deletePointsPromotionsStep = createStep(
  "delete-points-promotions",
  async (ids: string[], { container }) => {
    const valid = ids.filter(Boolean);
    if (!valid.length) return new StepResponse(undefined, null);
    const promotionModule = (container as MedusaContainer).resolve(Modules.PROMOTION);
    await promotionModule.softDeletePromotions(valid);
    return new StepResponse(undefined, valid);
  },
  async (ids, { container }) => {
    if (!ids?.length) return;
    await (container as MedusaContainer).resolve(Modules.PROMOTION).restorePromotions(ids);
  },
);

/** Promoción de puntos del carrito (para quitarla), o error si no tiene. */
export const findCartPointsPromotionStep = createStep(
  "find-cart-points-promotion",
  async (input: { cart_id: string; customer_id: string }, { container }) => {
    const { data } = await query(container).graph({
      entity: "cart",
      fields: ["id", "customer_id", "completed_at", "promotions.id", "promotions.code"],
      filters: { id: input.cart_id },
    });
    const cart = data[0] as CartForPoints | undefined;
    if (!cart || cart.customer_id !== input.customer_id) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Carrito no encontrado");
    }
    const promo = (cart.promotions ?? []).find((p) => isPointsPromoCode(p?.code));
    return new StepResponse(promo ? { id: promo.id!, code: promo.code! } : null);
  },
);
