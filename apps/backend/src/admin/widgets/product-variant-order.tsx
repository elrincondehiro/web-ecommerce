import { defineWidgetConfig } from "@medusajs/admin-sdk";
import type { AdminProduct, DetailWidgetProps } from "@medusajs/framework/types";
import { useEffect, useState } from "react";
import { compareVariants, type RankedVariant } from "../../lib/value-order";

/**
 * Orden de las variantes en la tienda (fase 13). El Admin de Medusa 2.22 solo deja ordenarlas al
 * CREAR el producto: aquí, con ↑/↓ y «Orden natural» (tallas, cantidades y alfabético, como la
 * tienda sin rango), se guardan `variant_rank` 0, 1, 2… con la ruta estándar
 * `POST /admin/products/:id/variants/batch` (`update`). La hoja de `catalog:import` también lo
 * fija (posición de la fila): manda lo último que se guarde. La tienda lo enseña tras la
 * siguiente publicación. Solo con 2 o más variantes. Zona `product.details.after`. La ficha del
 * Admin carga el producto SIN variantes (`PRODUCT_DETAIL_FIELDS = "…,-variants"`, dashboard
 * 2.22.7): el widget las pide a `GET /admin/products/:id?fields=…`.
 * Sin @medusajs/ui (no es dependencia directa del backend): HTML + clases del dashboard.
 */
type Row = { id: string; title: string; key: RankedVariant };

const button =
  "bg-ui-button-inverted text-ui-fg-on-inverted rounded-md px-3 py-1.5 text-sm disabled:opacity-50";
const ghost =
  "rounded-md border border-ui-border-base px-2 py-1 text-sm disabled:opacity-40 hover:bg-ui-bg-base-hover";

type VariantsResponse = {
  product: {
    options?: { id: string }[] | null;
    variants?:
      | {
          id: string;
          title?: string | null;
          variant_rank?: number | null;
          options?: { option_id?: string | null; value?: string | null }[] | null;
        }[]
      | null;
  };
};

function rowsOf(product: VariantsResponse["product"]): Row[] {
  const optionIds = (product.options ?? []).map((o) => o.id);
  return (product.variants ?? [])
    .map((v) => ({
      id: v.id,
      title: v.title ?? v.id,
      key: {
        variant_rank: v.variant_rank,
        values: optionIds.map(
          (id) => (v.options ?? []).find((ov) => ov.option_id === id)?.value ?? v.title ?? "",
        ),
      },
    }))
    .sort((a, b) => compareVariants(a.key, b.key));
}

const ProductVariantOrderWidget = ({ data }: DetailWidgetProps<AdminProduct>) => {
  const [rows, setRows] = useState<Row[] | null>(null);
  // Orden guardado: el de la carga y, tras «Guardar», el nuevo.
  const [saved, setSaved] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const fields = "id,*options,variants.id,variants.title,variants.variant_rank,*variants.options";
    fetch(`/admin/products/${data.id}?fields=${encodeURIComponent(fields)}`, {
      credentials: "include",
    })
      .then((r) => (r.ok ? (r.json() as Promise<VariantsResponse>) : Promise.reject(r.status)))
      .then(({ product }) => {
        const loaded = rowsOf(product);
        setRows(loaded);
        setSaved(loaded.map((r) => r.id));
      })
      .catch(() => setMsg({ ok: false, text: "No se han podido cargar las variantes." }));
  }, [data.id]);

  if (!rows) return msg ? <p className="text-ui-fg-error px-6 text-sm">{msg.text}</p> : null;
  if (rows.length < 2) return null;

  const changed = rows.some((r, i) => r.id !== saved[i]);
  const move = (i: number, d: -1 | 1) => {
    const next = [...rows];
    [next[i], next[i + d]] = [next[i + d]!, next[i]!];
    setRows(next);
    setMsg(null);
  };
  const natural = () => {
    setRows(
      [...rows].sort((a, b) =>
        compareVariants({ ...a.key, variant_rank: 0 }, { ...b.key, variant_rank: 0 }),
      ),
    );
    setMsg(null);
  };

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/admin/products/${data.id}/variants/batch`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ update: rows.map((row, i) => ({ id: row.id, variant_rank: i })) }),
      });
      if (!r.ok) {
        const json = (await r.json().catch(() => ({}))) as { message?: string };
        throw new Error(json.message ?? `Error ${r.status}`);
      }
      setSaved(rows.map((r) => r.id));
      setMsg({ ok: true, text: "Guardado. La tienda lo enseña tras la próxima publicación." });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shadow-elevation-card-rest bg-ui-bg-base rounded-lg px-6 py-4">
      <h2 className="font-sans text-base font-medium">Orden de las variantes en la tienda</h2>
      <p className="text-ui-fg-subtle mt-1 text-sm">
        Ordena con ↑ y ↓ o con «Orden natural» (tallas, cantidades y alfabético) y guarda.
      </p>
      <ol className="mt-3 flex flex-col gap-1 text-sm">
        {rows.map((row, i) => (
          <li key={row.id} className="flex items-center gap-2">
            <span className="text-ui-fg-muted w-6 text-right">{i + 1}.</span>
            <span className="flex-1">{row.title}</span>
            <button
              type="button"
              className={ghost}
              disabled={busy || i === 0}
              aria-label={`Subir ${row.title}`}
              onClick={() => move(i, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              className={ghost}
              disabled={busy || i === rows.length - 1}
              aria-label={`Bajar ${row.title}`}
              onClick={() => move(i, 1)}
            >
              ↓
            </button>
          </li>
        ))}
      </ol>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className={ghost} disabled={busy} onClick={natural}>
          Orden natural
        </button>
        <button type="button" className={button} disabled={busy || !changed} onClick={save}>
          Guardar orden
        </button>
        {msg && (
          <span className={`text-sm ${msg.ok ? "text-ui-fg-interactive" : "text-ui-fg-error"}`}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
};

export const config = defineWidgetConfig({ zone: "product.details.after" });

export default ProductVariantOrderWidget;
