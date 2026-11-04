import { defineWidgetConfig } from "@medusajs/admin-sdk";
import type { AdminProduct, DetailWidgetProps } from "@medusajs/framework/types";
import { useState } from "react";
import { EARNS_POINTS_KEY } from "../../lib/points";

/**
 * Descuentos y puntos de un producto (Fase CS), los mismos flags que la hoja:
 * - «Admite descuentos y pago con puntos» = `discountable` de Medusa (`pago_descuento`): sin él,
 *   ni códigos ni promociones ni puntos (los puntos son una promoción en Medusa: van juntos);
 * - «Genera puntos» = `metadata.genera_puntos` (`false` = no; por defecto sí).
 * Guarda con la API estándar (`POST /admin/products/:id`; la metadata se fusiona y "" borra la
 * clave). Zona `product.details.side` (context7, admin-sdk). Sin @medusajs/ui: HTML + clases.
 */
const button =
  "bg-ui-button-inverted text-ui-fg-on-inverted rounded-md px-3 py-1.5 text-sm disabled:opacity-50";

const ProductFlagsWidget = ({ data }: DetailWidgetProps<AdminProduct>) => {
  const [discountable, setDiscountable] = useState(data.discountable !== false);
  const [earns, setEarns] = useState(data.metadata?.[EARNS_POINTS_KEY] !== false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/admin/products/${data.id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discountable,
          metadata: { [EARNS_POINTS_KEY]: earns ? "" : false },
        }),
      });
      if (!r.ok) {
        const json = (await r.json().catch(() => ({}))) as { message?: string };
        throw new Error(json.message ?? `Error ${r.status}`);
      }
      setMsg({ ok: true, text: "Guardado. En la ficha se verá tras el próximo despliegue." });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shadow-elevation-card-rest bg-ui-bg-base rounded-lg px-6 py-4">
      <h2 className="font-sans text-base font-medium">Descuentos y puntos</h2>
      <div className="mt-3 flex flex-col gap-3 text-sm">
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-1"
            checked={discountable}
            disabled={busy}
            onChange={(e) => setDiscountable(e.currentTarget.checked)}
          />
          <span>
            Admite códigos descuento, promociones y pago con puntos
            <span className="text-ui-fg-subtle block">
              Sin marcar: ni códigos ni promociones ni puntos (van juntos).
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-1"
            checked={earns}
            disabled={busy}
            onChange={(e) => setEarns(e.currentTarget.checked)}
          />
          <span>
            Genera puntos
            <span className="text-ui-fg-subtle block">
              Sin marcar: su importe no suma puntos al cliente.
            </span>
          </span>
        </label>
        <div>
          <button type="button" className={button} disabled={busy} onClick={save}>
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </div>
        {msg && (
          <p
            role={msg.ok ? "status" : "alert"}
            className={msg.ok ? "text-ui-fg-subtle" : "text-ui-fg-error"}
          >
            {msg.text}
          </p>
        )}
      </div>
    </div>
  );
};

export const config = defineWidgetConfig({ zone: "product.details.side" });

export default ProductFlagsWidget;
