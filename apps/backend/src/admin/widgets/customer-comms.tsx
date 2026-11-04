import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { useEffect, useState } from "react";
import { COMMS_TOPICS } from "../../lib/comms";

/**
 * Comunicaciones del cliente en el Admin (Fase MK-A), solo lectura: qué temas tiene activos y el
 * historial (cuándo, desde dónde, con qué versión del texto y cómo se quitó). Lo decide el cliente
 * desde su cuenta o con la baja del email; la tienda no lo cambia.
 * Zona `customer.details.after` (context7 /medusajs/medusa, admin widgets: DetailWidgetProps).
 * Sin @medusajs/ui (no es dependencia directa del backend): HTML + clases del dashboard.
 */
type Data = {
  topics: { id: string; granted: boolean; granted_at: string | null }[];
  history: {
    topic: string;
    granted_at: string;
    source: string;
    text_version: number;
    revoked_at: string | null;
    revoked_via: string | null;
  }[];
};

const title = (id: string) => COMMS_TOPICS.find((t) => t.id === id)?.title ?? id;
const VIA: Record<string, string> = {
  cuenta: "desde la cuenta",
  baja: "con el enlace del email",
  admin: "desde el Admin",
};
const date = new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" });

const CustomerCommsWidget = ({ data }: { data: { id: string } }) => {
  const [comms, setComms] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/admin/customers/${data.id}/comms`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setComms)
      .catch(() => setError("No se han podido cargar las comunicaciones."));
  }, [data.id]);

  return (
    <div className="shadow-elevation-card-rest bg-ui-bg-base divide-y rounded-lg">
      <div className="px-6 py-4">
        <h2 className="font-sans text-base font-medium">Comunicaciones (emails comerciales)</h2>
        <p className="text-ui-fg-subtle text-xs">Las elige el cliente en su cuenta.</p>
      </div>
      {error && <p className="text-ui-fg-error px-6 py-3 text-sm">{error}</p>}
      {comms && (
        <ul className="px-6 py-3 text-sm">
          {comms.topics.map((t) => (
            <li key={t.id} className="flex justify-between gap-4 py-1">
              <span>{title(t.id)}</span>
              <span className={t.granted ? "text-ui-fg-base" : "text-ui-fg-muted"}>
                {t.granted && t.granted_at
                  ? `Sí, desde ${date.format(new Date(t.granted_at))}`
                  : "No"}
              </span>
            </li>
          ))}
        </ul>
      )}
      {comms && comms.history.length > 0 && (
        <details className="px-6 py-3 text-xs">
          <summary className="cursor-pointer">Historial ({comms.history.length})</summary>
          <ul className="text-ui-fg-subtle mt-2 flex flex-col gap-1">
            {comms.history.map((h, i) => (
              <li key={i}>
                {title(h.topic)}: activado {date.format(new Date(h.granted_at))} (
                {VIA[h.source] ?? h.source}, texto v{h.text_version})
                {h.revoked_at &&
                  ` · quitado ${date.format(new Date(h.revoked_at))} ${VIA[h.revoked_via ?? ""] ?? ""}`}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
};

export const config = defineWidgetConfig({ zone: "customer.details.after" });

export default CustomerCommsWidget;
