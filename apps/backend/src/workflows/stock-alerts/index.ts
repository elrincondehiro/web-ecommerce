import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { emitEventStep } from "@medusajs/medusa/core-flows";
import {
  mayRunOut,
  STOCK_ALERTS_FULFILLED,
  type AlertRow,
  type Restock,
} from "../../lib/stock-alerts";
import {
  createStockAlertStep,
  deleteStockAlertsStep,
  markNotifiedStep,
  validateStockAlertStep,
  type StockAlertInput,
} from "./steps";

/**
 * Workflows de los avisos de stock (Fase MK-B). Fuente: context7 /medusajs/medusa
 * (createWorkflow, `transform`, `emitEventStep`: el evento sale solo si el workflow termina bien).
 */

/** «Avísame cuando vuelva» (cliente con sesión). */
export const createStockAlertWorkflow = createWorkflow(
  "create-stock-alert",
  (input: StockAlertInput) => {
    validateStockAlertStep(input);
    const data = transform({ input }, ({ input }) => ({
      customer_id: input.customer_id,
      product_id: input.product_id,
      variant_id: input.variant_id,
    }));
    return new WorkflowResponse(createStockAlertStep(data));
  },
);

/** Quitar avisos del cliente (uno con `ids`, todos sin ellos) o, sin cliente, por id (job). */
export const deleteStockAlertsWorkflow = createWorkflow(
  "delete-stock-alerts",
  (input: { customer_id?: string; ids?: string[] }) =>
    new WorkflowResponse(deleteStockAlertsStep(input)),
);

export type StockAlertsFulfilledData = {
  customer_id: string;
  alerts: { id: string; product_id: string; variant_id: string; may_run_out: boolean }[];
};

/**
 * Avisos cumplidos de UN cliente: se marcan y se emite el evento (el email lo envía su
 * subscriber, en el worker, y después los borra).
 */
export const fulfillStockAlertsWorkflow = createWorkflow(
  "fulfill-stock-alerts",
  (input: { customer_id: string; alerts: AlertRow[]; restocks: Restock[] }) => {
    const ids = transform({ input }, ({ input }) => ({ ids: input.alerts.map((a) => a.id) }));
    markNotifiedStep(ids);
    const data = transform({ input }, ({ input }): StockAlertsFulfilledData => {
      const byVariant = new Map(input.restocks.map((r) => [r.variant_id, r]));
      return {
        customer_id: input.customer_id,
        alerts: input.alerts.map((a) => {
          const r = byVariant.get(a.variant_id);
          return {
            id: a.id,
            product_id: a.product_id,
            variant_id: a.variant_id,
            may_run_out: r ? mayRunOut(r) : false,
          };
        }),
      };
    });
    emitEventStep({ eventName: STOCK_ALERTS_FULFILLED, data });
    return new WorkflowResponse(data);
  },
);
