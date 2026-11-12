import { defineRouteConfig } from "@medusajs/admin-sdk";
import { useCallback, useEffect, useState } from "react";

/**
 * Moderación del escaparate «Vuestros peques» (Fase MK-D, /app/escaparate): las mascotas con la
 * casilla del escaparate y foto, por estado. Se modera CADA vez que cambia la foto (decisión del
 * usuario). Aprobar = sale en /peques/ (solo nombre, foto y edad); rechazar = no sale.
 * Rutas GET /admin/showcase?status=… y POST /admin/showcase/:id (sesión del Admin).
 * Fuente: context7 /medusajs/medusa (UI routes, defineRouteConfig; sin icono: @medusajs/icons no
 * es dependencia directa). Sin @medusajs/ui: HTML + clases del dashboard.
 */
type Status = "pendiente" | "aprobada" | "rechazada";
type Item = {
  id: string;
  name: string;
  photo: string;
  label: string | null;
  status: Status;
  customer_id: string;
  customer_email: string | null;
};

const TABS: { id: Status; label: string }[] = [
  { id: "pendiente", label: "Pendientes" },
  { id: "aprobada", label: "Publicadas" },
  { id: "rechazada", label: "Rechazadas" },
];

const ShowcasePage = () => {
  const [tab, setTab] = useState<Status>("pendiente");
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setItems(null);
    fetch(`/admin/showcase?status=${tab}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { pets: Item[] }) => setItems(d.pets))
      .catch(() => setError("No se ha podido cargar el escaparate."));
  }, [tab]);
  useEffect(load, [load]);

  const review = (id: string, decision: "aprobada" | "rechazada") => {
    setBusy(id);
    setError(null);
    fetch(`/admin/showcase/${id}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    })
      .then((r) => (r.ok ? load() : Promise.reject(new Error(String(r.status)))))
      .catch(() => setError("No se ha podido guardar."))
      .finally(() => setBusy(null));
  };

  const btn = "rounded-md px-3 py-1.5 text-sm disabled:opacity-50";
  return (
    <div className="shadow-elevation-card-rest bg-ui-bg-base divide-y rounded-lg">
      <div className="px-6 py-4">
        <h1 className="font-sans text-xl font-medium">Escaparate «Vuestros peques»</h1>
        <p className="text-ui-fg-subtle text-sm">
          Mascotas cuyos dueños han aceptado salir en el escaparate (solo nombre, foto y edad). Se
          revisa cada foto nueva.
        </p>
        <div className="mt-3 flex gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`${btn} ${tab === t.id ? "bg-ui-button-inverted text-ui-fg-on-inverted" : "bg-ui-bg-subtle"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="text-ui-fg-error px-6 py-3 text-sm">{error}</p>}
      {items && items.length === 0 && (
        <p className="text-ui-fg-subtle px-6 py-4 text-sm">No hay ninguna.</p>
      )}
      {items && items.length > 0 && (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4 p-6">
          {items.map((p) => (
            <li
              key={p.id}
              className="border-ui-border-base flex flex-col gap-2 rounded-lg border p-3"
            >
              <img src={p.photo} alt="" className="aspect-square w-full rounded-md object-cover" />
              <span className="font-medium">{p.name}</span>
              <span className="text-ui-fg-subtle text-xs">{p.label ?? "Sin edad"}</span>
              <a
                href={`/app/customers/${p.customer_id}`}
                className="text-ui-fg-interactive truncate text-xs"
              >
                {p.customer_email ?? "Ver cliente"}
              </a>
              <div className="mt-1 flex gap-2">
                {p.status !== "aprobada" && (
                  <button
                    type="button"
                    disabled={busy === p.id}
                    onClick={() => review(p.id, "aprobada")}
                    className={`${btn} bg-ui-button-inverted text-ui-fg-on-inverted`}
                  >
                    Aprobar
                  </button>
                )}
                {p.status !== "rechazada" && (
                  <button
                    type="button"
                    disabled={busy === p.id}
                    onClick={() => review(p.id, "rechazada")}
                    className={`${btn} bg-ui-bg-subtle`}
                  >
                    Rechazar
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export const config = defineRouteConfig({ label: "Escaparate" });

export default ShowcasePage;
