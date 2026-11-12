import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { useWaiting, WaitingTable } from "../components/stock-alerts";

/**
 * Avisos de stock de un producto (Fase MK-B): cuántos clientes esperan cada variante agotada.
 * Zona `product.details.after` (context7 /medusajs/medusa, admin widgets: DetailWidgetProps).
 * Sin avisos no se muestra nada.
 */
const ProductStockAlertsWidget = ({ data }: { data: { id: string } }) => {
  const { rows, error } = useWaiting(`/admin/products/${data.id}/stock-alerts`);
  if (!error && (!rows || rows.length === 0)) return null;
  return (
    <div className="shadow-elevation-card-rest bg-ui-bg-base divide-y rounded-lg">
      <div className="px-6 py-4">
        <h2 className="font-sans text-base font-medium">Clientes esperando stock</h2>
        <p className="text-ui-fg-subtle text-xs">
          Lista completa en{" "}
          <a href="/app/avisos-stock" className="text-ui-fg-interactive">
            Avisos de stock
          </a>
          .
        </p>
      </div>
      {error && <p className="text-ui-fg-error px-6 py-3 text-sm">{error}</p>}
      {rows && (
        <div className="px-3 py-3">
          <WaitingTable rows={rows} showProduct={false} />
        </div>
      )}
    </div>
  );
};

export const config = defineWidgetConfig({ zone: "product.details.after" });

export default ProductStockAlertsWidget;
