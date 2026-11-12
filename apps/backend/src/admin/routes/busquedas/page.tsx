import { defineRouteConfig } from "@medusajs/admin-sdk";
import { useEffect, useState } from "react";

/**
 * Página «Búsquedas» del Admin (Fase MK-E2, /app/busquedas): qué se busca en la tienda y qué no
 * encuentra, por periodo, con descarga en CSV. Datos de `GET /admin/search-terms`. Fuente:
 * context7 /medusajs/medusa (UI routes, `defineRouteConfig`).
 */
type Row = { term: string; count: number; zero: number; last_total: number; last_week: string };
const PERIODS = [7, 30, 90, 365];

function Table({
  rows,
  empty,
  store,
  zero,
}: {
  rows: Row[];
  empty: string;
  store: string | null;
  zero?: boolean;
}) {
  const th = "text-ui-fg-subtle px-3 py-2 text-left font-normal";
  if (!rows.length) return <p className="text-ui-fg-subtle px-3 py-2 text-sm">{empty}</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr>
          <th className={th}>Término</th>
          <th className={`${th} text-right`}>{zero ? "Sin resultados" : "Búsquedas"}</th>
          <th className={`${th} text-right`}>{zero ? "Búsquedas" : "Resultados (última)"}</th>
          <th className={th}>Última semana</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.term} className="border-ui-border-base border-t">
            <td className="px-3 py-2">
              {store ? (
                <a
                  className="text-ui-fg-interactive hover:underline"
                  href={`${store}/buscar/?q=${encodeURIComponent(r.term)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {r.term}
                </a>
              ) : (
                r.term
              )}
            </td>
            <td className="px-3 py-2 text-right font-medium tabular-nums">
              {zero ? r.zero : r.count}
            </td>
            <td className="px-3 py-2 text-right tabular-nums">{zero ? r.count : r.last_total}</td>
            <td className="text-ui-fg-subtle px-3 py-2">{r.last_week}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const SearchTermsPage = () => {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<{
    since: string;
    rows: Row[];
    store_url: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setData(null);
    setError(null);
    fetch(`/admin/search-terms?dias=${days}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setData)
      .catch(() => setError("No se han podido cargar las búsquedas."));
  }, [days]);
  const rows = data?.rows ?? [];
  // Sin resultados: los que fallaron alguna vez, de más a menos fallos; los que hoy ya encuentran
  // algo (última vez con resultados) van al final.
  const zero = rows
    .filter((r) => r.zero > 0)
    .sort((a, b) => Number(a.last_total > 0) - Number(b.last_total > 0) || b.zero - a.zero);
  const total = rows.reduce((n, r) => n + r.count, 0);
  return (
    <div className="flex flex-col gap-4">
      <div className="shadow-elevation-card-rest bg-ui-bg-base divide-y rounded-lg">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div>
            <h1 className="font-sans text-xl font-medium">Búsquedas</h1>
            <p className="text-ui-fg-subtle text-sm">
              Lo que se escribe en el buscador de la tienda (sin filtros), sin datos de nadie. Si
              varias personas buscan lo mismo en el mismo minuto puede contar una vez (caché): las
              cifras son orientativas. Se guardan 52 semanas.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="bg-ui-bg-field border-ui-border-base rounded-md border px-2 py-1 text-sm"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              aria-label="Periodo"
            >
              {PERIODS.map((d) => (
                <option key={d} value={d}>
                  Últimos {d === 365 ? "12 meses" : `${d} días`}
                </option>
              ))}
            </select>
            <a
              className="bg-ui-button-neutral shadow-buttons-neutral rounded-md px-3 py-1 text-sm"
              href={`/admin/search-terms?dias=${days}&formato=csv`}
              download
            >
              Descargar CSV
            </a>
          </div>
        </div>
        {error && <p className="text-ui-fg-error px-6 py-3 text-sm">{error}</p>}
        {data && (
          <p className="text-ui-fg-subtle px-6 py-2 text-xs">
            Desde la semana del {data.since} · {rows.length} términos · {total} búsquedas
          </p>
        )}
      </div>
      {data && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="shadow-elevation-card-rest bg-ui-bg-base rounded-lg px-3 py-3">
            <h2 className="px-3 pb-2 font-medium">Sin resultados</h2>
            <p className="text-ui-fg-subtle px-3 pb-2 text-xs">
              Qué falta o qué palabra no entiende el buscador (sinónimo en Meilisearch, título del
              producto…). Abajo, los que ya encuentran algo.
            </p>
            <Table
              rows={zero}
              empty="Ninguna búsqueda sin resultados."
              store={data.store_url}
              zero
            />
          </div>
          <div className="shadow-elevation-card-rest bg-ui-bg-base rounded-lg px-3 py-3">
            <h2 className="px-3 pb-2 font-medium">Más buscadas</h2>
            <Table rows={rows.slice(0, 100)} empty="Aún no hay búsquedas." store={data.store_url} />
          </div>
        </div>
      )}
    </div>
  );
};

export const config = defineRouteConfig({ label: "Búsquedas" });

export default SearchTermsPage;
