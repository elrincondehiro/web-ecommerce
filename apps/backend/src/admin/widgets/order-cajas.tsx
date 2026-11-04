import { defineWidgetConfig } from "@medusajs/admin-sdk";
import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CAJA_CONTENT_MAX, CAJA_ESTADO_LABEL, euros, type CajaEstado } from "../../lib/caja";

/**
 * Cajas de snacks del pedido (Fase CS-3): datos de cada caja («¿Para quién es?») y su contenido,
 * que se rellena aquí (GET/POST /admin/orders/:id/cajas*, workflow `fill-caja`). Una tarjeta por
 * caja: buscador de snacks (PVP y libre en la web), cantidades y «PVP del contenido / pagado».
 * Guardar rehace el contenido entero (mientras no se haya propuesto al cliente).
 * Zona `order.details.side` (context7, admin-sdk). Sin @medusajs/ui (no es dependencia directa del
 * backend): HTML + clases del dashboard, como el resto de widgets.
 */

type Caja = {
  line_item_id: string;
  estado: CajaEstado;
  editable: boolean;
  intento: number;
  vence_at: string | null;
  motivo_rechazo: string | null;
  paid: number;
  title: string;
  /** «Para Toby» (resumen del <details>). */
  name: string;
  details: string[];
  /** `quantity`: unidades, o gramos en el granel. */
  content: {
    item_id: string;
    variant_id: string | null;
    title: string;
    quantity: number;
    step_g: number | null;
  }[];
};
type Snack = {
  variant_id: string;
  title: string;
  variant_title: string | null;
  sku: string | null;
  /** PVP de una unidad o de un paso (granel). */
  price: number;
  /** Granel: gramos del paso; la cantidad se escribe en gramos. */
  step_g: number | null;
  price_kg: number | null;
  /** Libre en la web (granel: gramos). */
  available: number | null;
};
type Data = { cajas: Caja[]; blocked: string | null; snacks: Snack[] };

const when = (iso: string) =>
  new Date(iso).toLocaleString("es-ES", {
    timeZone: "Europe/Madrid",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const input = "rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1 text-sm";
const button =
  "bg-ui-button-inverted text-ui-fg-on-inverted rounded-md px-3 py-1.5 text-sm disabled:opacity-50";
const secondary = "rounded-md border border-ui-border-base px-3 py-1.5 text-sm disabled:opacity-50";

async function api(url: string, init?: RequestInit) {
  const r = await fetch(url, {
    credentials: "include",
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((json as { message?: string }).message ?? `Error ${r.status}`);
  return json;
}

// Con el SKU: hay productos con el mismo título (formatos, marcas)
/** Precio y stock de un snack: «6,95 € · 25 en la web» o, a granel, «20,00 €/kg · 1200 g en la web». */
const snackInfo = (s: Snack) => {
  const price = s.step_g ? `${euros(s.price_kg ?? 0)}/kg` : euros(s.price);
  const unit = s.step_g ? " g" : "";
  if (s.available === null) return price;
  return s.available > 0
    ? `${price} · ${s.available}${unit} en la web`
    : `${price} · 0${unit} en la web (mira el stock físico)`;
};

/** Cantidad de una línea: unidades o, a granel, gramos (paso y máximo de 1000 g). */
const qtyRule = (s: Snack | undefined) =>
  s?.step_g
    ? { min: s.step_g, step: s.step_g, max: CAJA_CONTENT_MAX.grams, unit: "g" }
    : { min: 1, step: 1, max: CAJA_CONTENT_MAX.quantity, unit: "" };

const snackLabel = (s: Snack) =>
  [s.title, s.variant_title].filter(Boolean).join(" · ") + (s.sku ? ` (${s.sku})` : "");

function CajaCard({
  orderId,
  caja,
  snacks,
  blocked,
  onSaved,
}: {
  orderId: string;
  caja: Caja;
  snacks: Snack[];
  blocked: string | null;
  onSaved: () => void;
}) {
  const byId = useMemo(() => new Map(snacks.map((s) => [s.variant_id, s])), [snacks]);
  const initial = () =>
    caja.content
      .filter((c) => c.variant_id)
      .map((c) => ({ variant_id: c.variant_id!, quantity: c.quantity }));
  const [editing, setEditing] = useState(false);
  const [lines, setLines] = useState(initial);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Granel: cantidad en gramos → pasos × precio del paso (como el backend)
  const pvp = lines.reduce((sum, l) => {
    const s = byId.get(l.variant_id);
    const units = s?.step_g ? l.quantity / s.step_g : l.quantity;
    return sum + Math.round((s?.price ?? 0) * 100) * units;
  }, 0);
  const short = pvp < Math.round(caja.paid * 100);
  const term = search.trim().toLowerCase();
  const found = term
    ? snacks
        .filter(
          (s) =>
            !lines.some((l) => l.variant_id === s.variant_id) &&
            `${snackLabel(s)} ${s.sku ?? ""}`.toLowerCase().includes(term),
        )
        .slice(0, 8)
    : [];

  // Se guarda lo tecleado; el backend lo valida (el navegador marca lo que no es múltiplo del paso)
  const setQty = (id: string, quantity: number) =>
    setLines((ls) => ls.map((l) => (l.variant_id === id ? { ...l, quantity } : l)));
  const invalid = lines.some((l) => {
    const r = qtyRule(byId.get(l.variant_id));
    return (
      !Number.isInteger(l.quantity) ||
      l.quantity < r.min ||
      l.quantity > r.max ||
      l.quantity % r.step !== 0
    );
  });
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/orders/${orderId}/cajas/${caja.line_item_id}`, {
        method: "POST",
        body: JSON.stringify({ items: lines }),
      });
      setEditing(false);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="border-ui-border-base border-t pt-3 text-sm first:border-0 first:pt-0">
      <p className="font-medium">{caja.title}</p>
      <details className="text-ui-fg-subtle">
        <summary className="cursor-pointer">{caja.name}</summary>
        <ul className="mt-1 pl-3">
          {caja.details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </details>
      <p className="mt-2">
        <span className="text-ui-fg-subtle">Estado: </span>
        {CAJA_ESTADO_LABEL[caja.estado]}
        {caja.intento > 1 ? ` · ${caja.intento}.ª versión` : ""}
        {caja.vence_at ? ` · se acepta sola el ${when(caja.vence_at)}` : ""}
      </p>
      {caja.estado === "rechazada" && caja.motivo_rechazo && (
        <p className="text-ui-fg-error mt-1">«{caja.motivo_rechazo}»</p>
      )}

      {!editing && (
        <>
          {caja.content.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {caja.content.map((c) => (
                <li key={c.item_id}>
                  {c.step_g ? `${c.quantity} g` : `${c.quantity} ×`} {c.title}
                </li>
              ))}
            </ul>
          )}
          {caja.editable && !blocked && (
            <button
              type="button"
              className={`${secondary} mt-2`}
              onClick={() => {
                setLines(initial());
                setEditing(true);
              }}
            >
              {caja.content.length ? "Cambiar contenido" : "Preparar caja"}
            </button>
          )}
        </>
      )}

      {editing && (
        <div className="mt-2 flex flex-col gap-2">
          <ul className="flex flex-col gap-1">
            {lines.map((l) => {
              const s = byId.get(l.variant_id);
              const r = qtyRule(s);
              return (
                <li key={l.variant_id} className="flex items-center gap-2">
                  <input
                    type="number"
                    min={r.min}
                    max={r.max}
                    step={r.step}
                    value={l.quantity}
                    aria-label={`${r.unit ? "Gramos" : "Cantidad"} de ${s ? snackLabel(s) : "producto"}`}
                    className={`${input} invalid:border-ui-fg-error w-20`}
                    onChange={(e) => setQty(l.variant_id, Number(e.target.value))}
                  />
                  {r.unit && <span>{r.unit}</span>}
                  <span className="flex-1">
                    {s ? snackLabel(s) : "(ya no está disponible)"}
                    {s && <span className="text-ui-fg-subtle"> · {snackInfo(s)}</span>}
                  </span>
                  <button
                    type="button"
                    className="text-ui-fg-subtle underline"
                    onClick={() =>
                      setLines((ls) => ls.filter((x) => x.variant_id !== l.variant_id))
                    }
                  >
                    Quitar
                  </button>
                </li>
              );
            })}
          </ul>
          {lines.length < CAJA_CONTENT_MAX.lines && (
            <div>
              <input
                type="search"
                placeholder="Buscar snack por nombre o SKU"
                aria-label="Buscar snack"
                value={search}
                className={`${input} w-full`}
                onChange={(e) => setSearch(e.target.value)}
              />
              {found.length > 0 && (
                <ul className="border-ui-border-base mt-1 rounded-md border">
                  {found.map((s) => (
                    <li key={s.variant_id}>
                      <button
                        type="button"
                        className="hover:bg-ui-bg-base-hover w-full px-2 py-1 text-left"
                        onClick={() => {
                          // Granel: empieza con 100 g (o un paso si es mayor)
                          const first = s.step_g
                            ? Math.max(s.step_g, Math.round(100 / s.step_g) * s.step_g)
                            : 1;
                          setLines((ls) => [...ls, { variant_id: s.variant_id, quantity: first }]);
                          setSearch("");
                        }}
                      >
                        {snackLabel(s)}
                        <span className="text-ui-fg-subtle"> · {snackInfo(s)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {term && !found.length && (
                <p className="text-ui-fg-subtle mt-1">Ningún snack con ese nombre.</p>
              )}
            </div>
          )}
          <p className={short ? "text-ui-fg-error" : "text-ui-fg-subtle"}>
            PVP del contenido: {euros(pvp / 100)} de {euros(caja.paid)} pagados
            {short && " (tiene que valer al menos lo pagado)"}
            {invalid &&
              ` · revisa las cantidades (granel: en pasos del producto, hasta ${CAJA_CONTENT_MAX.grams} g)`}
          </p>
          {error && (
            <p role="alert" className="text-ui-fg-error">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              className={button}
              disabled={busy || !lines.length || short || invalid}
              onClick={save}
            >
              {busy ? "Guardando…" : "Guardar contenido"}
            </button>
            <button
              type="button"
              className={secondary}
              disabled={busy}
              onClick={() => setEditing(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

const OrderCajasWidget = ({ data: order }: DetailWidgetProps<AdminOrder>) => {
  const hasCajas = (order.items ?? []).some((i) => typeof i?.metadata?.caja_ref === "string");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [proposing, setProposing] = useState(false);
  const load = useCallback(() => {
    if (!hasCajas) return;
    api(`/admin/orders/${order.id}/cajas`)
      .then((d) => setData(d as Data))
      .catch((e: Error) => setError(e.message));
  }, [order.id, hasCajas]);
  useEffect(load, [load]);
  if (!hasCajas) return null;
  const cajas = data?.cajas ?? [];
  // Proponer: todas preparadas (o ya resueltas) y al menos una por proponer (CS-4)
  const open = cajas.some((c) => c.estado === "pendiente" || c.estado === "rechazada");
  const proposable = !open && cajas.some((c) => c.estado === "rellena");
  const propose = async () => {
    if (!window.confirm("Se enviará al cliente un email con las cajas preparadas. ¿Seguro?"))
      return;
    setProposing(true);
    setError(null);
    try {
      await api(`/admin/orders/${order.id}/cajas/proponer`, { method: "POST", body: "{}" });
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProposing(false);
    }
  };
  return (
    <div className="shadow-elevation-card-rest bg-ui-bg-base rounded-lg px-6 py-4">
      <h2 className="font-sans text-base font-medium">
        {cajas.length > 1 ? `Cajas de snacks (${cajas.length})` : "Caja de snacks"}
      </h2>
      {error && (
        <p role="alert" className="text-ui-fg-error mt-2 text-sm">
          {error}
        </p>
      )}
      {!data && !error && <p className="text-ui-fg-subtle mt-2 text-sm">Cargando…</p>}
      {data?.blocked && <p className="text-ui-fg-subtle mt-2 text-sm">{data.blocked}</p>}
      {data && (
        <ul className="mt-3 flex flex-col gap-3">
          {cajas.map((c) => (
            <CajaCard
              key={c.line_item_id}
              orderId={order.id}
              caja={c}
              snacks={data.snacks}
              blocked={data.blocked}
              // Tras guardar, recarga la página: el resumen del pedido de Medusa enseña las líneas
              // nuevas (a 0 €) y el stock libre de los snacks cambia
              onSaved={() => window.location.reload()}
            />
          ))}
        </ul>
      )}
      {data && cajas.length > 0 && (
        <div className="border-ui-border-base mt-3 border-t pt-3 text-sm">
          {proposable ? (
            <button type="button" className={button} disabled={proposing} onClick={propose}>
              {proposing ? "Enviando…" : "Proponer al cliente"}
            </button>
          ) : (
            <p className="text-ui-fg-subtle">
              {open
                ? "Prepara todas las cajas para proponerlas al cliente (un email con todas)."
                : cajas.every((c) => c.estado === "aceptada" || c.estado === "aceptada_auto")
                  ? "Todas aceptadas: el pedido se puede enviar."
                  : "Esperando la respuesta del cliente (se aceptan solas a las 24 h)."}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export const config = defineWidgetConfig({ zone: "order.details.side" });

export default OrderCajasWidget;
