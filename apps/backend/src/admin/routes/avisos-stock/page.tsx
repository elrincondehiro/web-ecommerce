import { defineRouteConfig } from "@medusajs/admin-sdk";
import { useWaiting, WaitingTable } from "../../components/stock-alerts";

/**
 * Página «Avisos de stock» del Admin (Fase MK-B, /app/avisos-stock): todo lo que esperan los
 * clientes, de más esperado a menos, con lo que hay a la venta (en rojo si no llega para todos).
 * Mismos datos que `pnpm --filter backend stock-alerts:list`. Fuente: context7 /medusajs/medusa
 * (UI routes, `defineRouteConfig`; sin icono: @medusajs/icons no es dependencia directa).
 */
const StockAlertsPage = () => {
  const { rows, error } = useWaiting("/admin/stock-alerts");
  const total = rows?.reduce((n, r) => n + r.waiting, 0) ?? 0;
  return (
    <div className="shadow-elevation-card-rest bg-ui-bg-base divide-y rounded-lg">
      <div className="px-6 py-4">
        <h1 className="font-sans text-xl font-medium">Avisos de stock</h1>
        <p className="text-ui-fg-subtle text-sm">
          Productos agotados que esperan los clientes («Avísame cuando vuelva»). Al reponer, se les
          avisa por email en unos minutos.
        </p>
      </div>
      {error && <p className="text-ui-fg-error px-6 py-3 text-sm">{error}</p>}
      {rows && rows.length === 0 && (
        <p className="text-ui-fg-subtle px-6 py-4 text-sm">Nadie espera ningún producto.</p>
      )}
      {rows && rows.length > 0 && (
        <div className="px-3 py-3">
          <p className="text-ui-fg-subtle px-3 pb-2 text-xs">
            {rows.length} variantes · {total} avisos
          </p>
          <WaitingTable rows={rows} showProduct />
        </div>
      )}
    </div>
  );
};

export const config = defineRouteConfig({ label: "Avisos de stock" });

export default StockAlertsPage;
