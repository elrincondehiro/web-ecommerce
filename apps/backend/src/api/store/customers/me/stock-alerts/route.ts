import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { z } from "@medusajs/framework/zod";
import { STOCK_ALERT_MODULE } from "../../../../../modules/stock-alert";
import type StockAlertModuleService from "../../../../../modules/stock-alert/service";
import { createStockAlertWorkflow } from "../../../../../workflows/stock-alerts";

/**
 * Avisos de stock del cliente (Fase MK-B). La sesión la exige Medusa (`/store/customers/me*`).
 * GET → `{ alerts: [{ id, product_id, variant_id, created_at }] }` (más recientes primero; solo
 * ids: producto, precio y stock los pide el storefront a la Store API).
 * POST `{ product_id, variant_id }` → 201 (creado) o 200 (ya estaba); 400 si hay stock, es
 * configurable o está descatalogado; 404 si no existe en el canal.
 */
export const StoreStockAlertBody = z.object({
  product_id: z.string().regex(/^prod_[0-9A-Za-z]{1,40}$/),
  variant_id: z.string().regex(/^variant_[0-9A-Za-z]{1,40}$/),
});

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const alerts = await req.scope
    .resolve<StockAlertModuleService>(STOCK_ALERT_MODULE)
    .listStockAlerts(
      { customer_id: req.auth_context.actor_id, notified_at: null },
      { select: ["id", "product_id", "variant_id", "created_at"], order: { created_at: "DESC" } },
    );
  res.json({ alerts });
}

export async function POST(
  req: AuthenticatedMedusaRequest<z.infer<typeof StoreStockAlertBody>>,
  res: MedusaResponse,
) {
  const { result } = await createStockAlertWorkflow(req.scope).run({
    input: {
      customer_id: req.auth_context.actor_id,
      ...req.validatedBody,
      sales_channel_ids: req.publishable_key_context?.sales_channel_ids ?? [],
    },
  });
  res.status(result.created ? 201 : 200).json({
    alert: {
      id: result.alert.id,
      product_id: result.alert.product_id,
      variant_id: result.alert.variant_id,
    },
    created: result.created,
  });
}
