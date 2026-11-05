import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { STOCK_ALERTS_FULFILLED, variantLabel } from "../lib/stock-alerts";
import { variantsInfo } from "../lib/stock-alerts-data";
import type { StockAlertsFulfilledData } from "../workflows/stock-alerts";
import { deleteStockAlertsWorkflow } from "../workflows/stock-alerts";
import { emailEnabled, hashKey, linksFrom, sendEmail } from "./_email";

/**
 * Avisos de stock cumplidos (Fase MK-B): un email al cliente con lo que ha vuelto y se borran los
 * avisos. Lo pidió el cliente para ese producto (permiso por acción, opción B de MK-A): no depende
 * de «Comunicaciones». Sin EMAIL_TRANSPORT (tests) solo se borran. No se registra el email.
 */
export default async function stockAlertsEmail({
  event: { data },
  container,
}: SubscriberArgs<StockAlertsFulfilledData>) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  if (emailEnabled() && data.alerts.length) {
    const {
      data: [customer],
    } = await query.graph({
      entity: "customer",
      fields: ["email"],
      filters: { id: data.customer_id },
    });
    const to = (customer as { email?: string } | undefined)?.email;
    if (to) {
      const links = linksFrom(container);
      const infos = await variantsInfo(
        container,
        data.alerts.map((a) => a.variant_id),
      );
      const items = data.alerts.flatMap((a) => {
        const v = infos.get(a.variant_id);
        if (!v?.product) return [];
        return [
          {
            title: v.product.title,
            variant: variantLabel(v.product.title, v.title),
            url: `${links.storefrontUrl}/producto/${v.product.handle}/`,
            thumbnail: v.product.thumbnail?.startsWith("http") ? v.product.thumbnail : null,
            mayRunOut: a.may_run_out,
          },
        ];
      });
      if (items.length) {
        await sendEmail(container, {
          to,
          template: "stock-back",
          data: { ...links, items, alertsUrl: `${links.storefrontUrl}/cuenta/avisos/` },
          idempotencyKey: hashKey(
            "stock-back",
            data.alerts
              .map((a) => a.id)
              .sort()
              .join(","),
          ),
        });
      }
    }
  }
  await deleteStockAlertsWorkflow(container).run({
    input: { ids: data.alerts.map((a) => a.id) },
  });
}

export const config: SubscriberConfig = { event: STOCK_ALERTS_FULFILLED };
