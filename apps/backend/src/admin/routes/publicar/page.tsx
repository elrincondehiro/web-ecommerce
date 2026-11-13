import { defineRouteConfig } from "@medusajs/admin-sdk";
import { useCallback, useEffect, useState } from "react";

/**
 * «Publicar en la tienda» (fase 13, /app/publicar): las fichas, listados y categorías se generan
 * en un build. Los cambios de catálogo se publican solos tras unos minutos sin cambios; aquí se ve
 * el estado y se puede publicar ya. Precio y stock no hace falta: se actualizan solos.
 * Fuente: context7 /medusajs/medusa (UI routes, `defineRouteConfig`).
 */
type State = {
  pending_since: string | null;
  last_change_at: string | null;
  requested_at: string | null;
  status: "idle" | "queued" | "running" | "ok" | "failed";
  started_at: string | null;
  finished_at: string | null;
  run_url: string | null;
  error: string | null;
};
type Data = {
  state: State;
  next: { publish: boolean; reason: string };
  quiet_minutes: number;
  configured: boolean;
};

const fmt = (v: string | null) =>
  v
    ? new Intl.DateTimeFormat("es-ES", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "Europe/Madrid",
      }).format(new Date(v))
    : "—";

const LABEL: Record<State["status"], string> = {
  idle: "Sin publicaciones todavía",
  queued: "En cola (esperando al servidor de builds)…",
  running: "Publicando…",
  ok: "Publicado",
  failed: "La última publicación falló",
};

const PublishPage = () => {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    fetch("/admin/storefront-publish", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Data) => {
        setData(d);
        setError(null);
      })
      .catch(() => setError("No se ha podido cargar el estado."));
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  const publish = () => {
    setBusy(true);
    fetch("/admin/storefront-publish", { method: "POST", credentials: "include" })
      .then((r) => (r.ok ? load() : Promise.reject(new Error(String(r.status)))))
      .catch(() => setError("No se ha podido pedir la publicación."))
      .finally(() => setBusy(false));
  };

  const s = data?.state;
  const pending = Boolean(s?.pending_since);
  return (
    <div className="shadow-elevation-card-rest bg-ui-bg-base divide-y rounded-lg">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div>
          <h1 className="font-sans text-xl font-medium">Publicar en la tienda</h1>
          <p className="text-ui-fg-subtle text-sm">
            Productos, fotos, textos, categorías, colecciones y ofertas nuevas se ven en la tienda
            al publicarla. Se publica sola {data ? `${data.quiet_minutes} min` : "unos minutos"}{" "}
            después del último cambio. El precio y el stock no hace falta: se actualizan solos.
          </p>
        </div>
        <button
          type="button"
          className="bg-ui-button-inverted text-ui-fg-on-inverted rounded-md px-3 py-1.5 text-sm disabled:opacity-50"
          onClick={publish}
          disabled={
            busy ||
            !data ||
            s?.status === "running" ||
            s?.status === "queued" ||
            Boolean(s?.requested_at)
          }
        >
          {s?.requested_at ? "Pedida: empieza en 1–2 min" : "Publicar ahora"}
        </button>
      </div>
      {error && <p className="text-ui-fg-error px-6 py-3 text-sm">{error}</p>}
      {data && !data.configured && (
        <p className="text-ui-fg-subtle px-6 py-3 text-sm">
          La publicación automática no está configurada en este servidor
          (STOREFRONT_REBUILD_SECRET).
        </p>
      )}
      {s && (
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 px-6 py-4 text-sm">
          <dt className="text-ui-fg-subtle">Cambios sin publicar</dt>
          <dd>
            {pending
              ? `desde ${fmt(s.pending_since)} (último: ${fmt(s.last_change_at)})`
              : "ninguno"}
          </dd>
          <dt className="text-ui-fg-subtle">Siguiente</dt>
          <dd>{data.next.publish ? "se publicará en 1–2 min" : data.next.reason}</dd>
          <dt className="text-ui-fg-subtle">Última publicación</dt>
          <dd className={s.status === "failed" ? "text-ui-fg-error" : undefined}>
            {LABEL[s.status]}
            {s.started_at && ` · empezó ${fmt(s.started_at)}`}
            {s.finished_at && ` · terminó ${fmt(s.finished_at)}`}
            {s.run_url && (
              <>
                {" · "}
                <a
                  className="text-ui-fg-interactive hover:underline"
                  href={s.run_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  ver el registro
                </a>
              </>
            )}
          </dd>
          {s.status === "failed" && s.error && (
            <>
              <dt className="text-ui-fg-subtle">Error</dt>
              <dd className="text-ui-fg-error break-words">{s.error}</dd>
            </>
          )}
        </dl>
      )}
    </div>
  );
};

export const config = defineRouteConfig({ label: "Publicar en la tienda" });

export default PublishPage;
