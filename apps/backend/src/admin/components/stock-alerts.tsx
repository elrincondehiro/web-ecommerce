import { useEffect, useState } from "react";

/**
 * Tabla de la lista de espera de los avisos de stock (Fase MK-B): la usan la página «Avisos de
 * stock» (todo) y el widget del producto (sus variantes). Sin datos de los clientes, solo cuántos.
 * Sin @medusajs/ui (no es dependencia directa del backend): HTML + clases del dashboard.
 */
export type WaitingRow = {
  product_id: string;
  variant_id: string;
  product_title: string;
  variant_title: string | null;
  sku: string | null;
  waiting: number;
  oldest: string;
  /** Lo que hay a la venta ahora (null = sin límite). */
  available: number | null;
};

const date = new Intl.DateTimeFormat("es-ES", { dateStyle: "short" });

export function useWaiting(url: string) {
  const [rows, setRows] = useState<WaitingRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch(url, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { rows: WaitingRow[] }) => setRows(d.rows))
      .catch(() => setError("No se ha podido cargar la lista de espera."));
  }, [url]);
  return { rows, error };
}

export function WaitingTable({ rows, showProduct }: { rows: WaitingRow[]; showProduct: boolean }) {
  const th = "text-ui-fg-subtle px-3 py-2 text-left font-normal";
  return (
    <table className="w-full text-sm">
      <thead>
        <tr>
          <th className={th}>Esperando</th>
          {showProduct && <th className={th}>Producto</th>}
          <th className={th}>Variante</th>
          <th className={th}>SKU</th>
          <th className={th}>A la venta</th>
          <th className={th}>Desde</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const short = r.available !== null && r.available < r.waiting;
          return (
            <tr key={r.variant_id} className="border-ui-border-base border-t">
              <td className="px-3 py-2 font-medium">{r.waiting}</td>
              {showProduct && (
                <td className="px-3 py-2">
                  <a href={`/app/products/${r.product_id}`} className="text-ui-fg-interactive">
                    {r.product_title}
                  </a>
                </td>
              )}
              <td className="px-3 py-2">{r.variant_title ?? "—"}</td>
              <td className="text-ui-fg-subtle px-3 py-2">{r.sku ?? "—"}</td>
              <td className={`px-3 py-2 ${short ? "text-ui-fg-error" : ""}`}>
                {r.available === null ? "sin límite" : r.available}
              </td>
              <td className="text-ui-fg-subtle px-3 py-2">{date.format(new Date(r.oldest))}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
