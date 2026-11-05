import { MedusaError } from "@medusajs/framework/utils";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { isDiscontinued } from "../../lib/descatalogado";
import { productDesign } from "../../lib/disenos";
import { STOCK_ALERT_MAX_PER_CUSTOMER } from "../../lib/stock-alerts";
import { availableUnits, variantsInfo } from "../../lib/stock-alerts-data";
import { STOCK_ALERT_MODULE } from "../../modules/stock-alert";
import type StockAlertModuleService from "../../modules/stock-alert/service";

/**
 * Pasos de los avisos de stock (Fase MK-B). Patrón de la guía oficial `wishlist` (context7
 * /medusajs/medusa): cada paso que escribe tiene compensación. Todo por `customer_id`: un aviso
 * de otro cliente se trata como inexistente.
 */
const service = (c: { resolve: <T>(k: string) => T }) =>
  c.resolve<StockAlertModuleService>(STOCK_ALERT_MODULE);

export type StockAlertInput = {
  customer_id: string;
  product_id: string;
  variant_id: string;
  /** Canales de la publishable key de la petición. */
  sales_channel_ids: string[];
};

/**
 * Se puede pedir aviso de una variante publicada, del canal, de ese producto, AGOTADA y que no sea
 * de un diseño configurable (correa, caja: no esperan stock) ni descatalogada.
 */
export const validateStockAlertStep = createStep(
  "validate-stock-alert",
  async (input: StockAlertInput, { container }) => {
    const info = (await variantsInfo(container as never, [input.variant_id])).get(input.variant_id);
    const p = info?.product;
    const inChannel =
      !input.sales_channel_ids.length ||
      (p?.sales_channel_ids ?? []).some((id) => input.sales_channel_ids.includes(id));
    if (!info || !p || p.id !== input.product_id || p.status !== "published" || !inChannel) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Producto no encontrado");
    }
    if (isDiscontinued(p.metadata)) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Este producto está descatalogado.");
    }
    if (productDesign(p).configurable) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Este producto no admite avisos.");
    }
    const available = (await availableUnits(container as never, new Map([[info.id, info]]))).get(
      info.id,
    );
    if ((available ?? 0) > 0) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Ya hay stock de este producto.");
    }
  },
);

/** Crea el aviso si no estaba (idempotente). Compensación: borrar lo creado. */
export const createStockAlertStep = createStep(
  "create-stock-alert",
  async (input: Omit<StockAlertInput, "sales_channel_ids">, { container }) => {
    const svc = service(container);
    const [existing] = await svc.listStockAlerts({
      customer_id: input.customer_id,
      variant_id: input.variant_id,
    });
    if (existing) return new StepResponse({ alert: existing, created: false }, null);
    const count = await svc.listAndCountStockAlerts(
      { customer_id: input.customer_id },
      { take: 1 },
    );
    if (count[1] >= STOCK_ALERT_MAX_PER_CUSTOMER) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Como mucho ${STOCK_ALERT_MAX_PER_CUSTOMER} avisos a la vez.`,
      );
    }
    const alert = await svc.createStockAlerts({
      customer_id: input.customer_id,
      product_id: input.product_id,
      variant_id: input.variant_id,
    });
    return new StepResponse({ alert, created: true }, alert.id);
  },
  async (id, { container }) => {
    if (id) await service(container).deleteStockAlerts(id);
  },
);

/**
 * Borra (suave) avisos: los del cliente (`ids` suyos, o todos si no se pasan) o, sin cliente,
 * esos `ids` (job). Compensación: restaurarlos.
 */
export const deleteStockAlertsStep = createStep(
  "delete-stock-alerts",
  async (input: { customer_id?: string; ids?: string[] }, { container }) => {
    const svc = service(container);
    if (!input.customer_id && !input.ids?.length) return new StepResponse([] as string[], []);
    const rows = await svc.listStockAlerts({
      ...(input.customer_id ? { customer_id: input.customer_id } : {}),
      ...(input.ids ? { id: input.ids } : {}),
    });
    const ids = rows.map((r) => r.id);
    if (ids.length) await svc.softDeleteStockAlerts(ids);
    return new StepResponse(ids, ids);
  },
  async (ids, { container }) => {
    if (ids?.length) await service(container).restoreStockAlerts(ids);
  },
);

/** Marca como avisados (antes de emitir el evento). Compensación: desmarcar. */
export const markNotifiedStep = createStep(
  "mark-stock-alerts-notified",
  async (input: { ids: string[] }, { container }) => {
    if (!input.ids.length) return new StepResponse([] as string[], []);
    const now = new Date();
    await service(container).updateStockAlerts(input.ids.map((id) => ({ id, notified_at: now })));
    return new StepResponse(input.ids, input.ids);
  },
  async (ids, { container }) => {
    if (ids?.length) {
      await service(container).updateStockAlerts(ids.map((id) => ({ id, notified_at: null })));
    }
  },
);
