import { defineWidgetConfig } from "@medusajs/admin-sdk";
import type { AdminProductOption, DetailWidgetProps } from "@medusajs/framework/types";
import { useEffect, useMemo, useState } from "react";
import {
  COLOR_FAMILIES,
  FAMILY_ID_RE,
  MAX_FAMILIES,
  MAX_FAMILIES_PER_VALUE,
  optionFamilies,
  valueFamilies,
  type OptionFamily,
} from "../../lib/option-families";

/**
 * Familias de una opción para los filtros de la tienda (Fase FO-5). Zona
 * `product_option.details.after` (ficha de una opción: Productos → Opciones; comprobada en
 * @medusajs/admin-shared 2.22.1). Lee los valores de `GET /admin/product-options/:id/values`
 * (trae `metadata`) y guarda TODO de una vez con `POST /admin/option-families/:id` (mismo plan
 * que familias.csv, workflow con compensación; reindexa /buscar/ solo).
 * - Arriba, las familias: nombre, id (se rellena del nombre), color del punto y orden (↑↓).
 * - Debajo, una tabla con todos los valores: una casilla por familia (≤ 4 por valor) y el color
 *   de la muestra del selector de la ficha (`metadata.color`, Fase O).
 * Sin @medusajs/ui (no es dependencia directa del backend): HTML + clases del dashboard.
 */

type Row = { id: string; value: string; families: string[]; color: string | null };

const button =
  "bg-ui-button-inverted text-ui-fg-on-inverted rounded-md px-3 py-1.5 text-sm disabled:opacity-50";
const secondary =
  "rounded-md border border-ui-border-base px-2 py-1 text-sm disabled:opacity-40 hover:bg-ui-bg-base-hover";
const input = "rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1 text-sm";
const HEX = /^#[0-9a-f]{6}$/i;

/** «Marrón y beige» → «marron-y-beige» (id de la familia: va en la URL del filtro). */
const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

async function api(url: string, init?: RequestInit) {
  const r = await fetch(url, { credentials: "include", ...init });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((json as { message?: string }).message ?? `Error ${r.status}`);
  return json as Record<string, unknown>;
}

/** Color de muestra: selector nativo + texto (vacío = sin color). */
function ColorField({
  value,
  onChange,
  label,
  disabled,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  label: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(value ?? "");
  useEffect(() => setText(value ?? ""), [value]);
  return (
    <span className="flex items-center gap-1">
      <input
        type="color"
        aria-label={`${label}: elegir color`}
        value={value ?? "#ffffff"}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="border-ui-border-base h-7 w-8 cursor-pointer rounded border bg-transparent p-0"
      />
      <input
        aria-label={`${label}: código #rrggbb`}
        value={text}
        placeholder="—"
        disabled={disabled}
        maxLength={7}
        onChange={(e) => {
          const v = e.target.value.trim();
          setText(v);
          if (!v) onChange(null);
          else if (HEX.test(v)) onChange(v.toLowerCase());
        }}
        className={`${input} w-24 font-mono ${text && !HEX.test(text) ? "border-ui-tag-red-border" : ""}`}
      />
      {value && (
        <button
          type="button"
          className="text-ui-fg-subtle text-xs underline"
          disabled={disabled}
          onClick={() => onChange(null)}
        >
          quitar
        </button>
      )}
    </span>
  );
}

const OptionFamiliesWidget = ({ data }: DetailWidgetProps<AdminProductOption>) => {
  const exclusive = Boolean((data as { is_exclusive?: boolean }).is_exclusive);
  const [families, setFamilies] = useState<OptionFamily[]>(() =>
    optionFamilies(data.metadata as Record<string, unknown> | null),
  );
  const [rows, setRows] = useState<Row[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    const { product_option_values: values } = (await api(
      `/admin/product-options/${data.id}/values?limit=500&fields=id,value,rank,metadata`,
    )) as {
      product_option_values?: {
        id: string;
        value: string;
        rank?: number | null;
        metadata?: Record<string, unknown> | null;
      }[];
    };
    const fams = optionFamilies(data.metadata as Record<string, unknown> | null);
    setFamilies(fams);
    setRows(
      [...(values ?? [])]
        .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0) || a.value.localeCompare(b.value, "es"))
        .map((v) => ({
          id: v.id,
          value: v.value,
          families: valueFamilies(v.metadata, fams),
          color: typeof v.metadata?.color === "string" ? v.metadata.color : null,
        })),
    );
    setDirty(false);
  };
  useEffect(() => {
    if (!exclusive) load().catch((e) => setMsg({ ok: false, text: (e as Error).message }));
  }, [data.id]); // eslint-disable-line react-hooks/exhaustive-deps -- solo al cambiar de opción

  const change = <T,>(fn: (prev: T) => T, set: (f: (prev: T) => T) => void) => {
    set(fn);
    setDirty(true);
    setMsg(null);
  };
  const setFam = (i: number, patch: Partial<OptionFamily>) =>
    change<OptionFamily[]>(
      (fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)),
      setFamilies,
    );
  const move = (i: number, d: -1 | 1) =>
    change<OptionFamily[]>((fs) => {
      const next = [...fs];
      [next[i], next[i + d]] = [next[i + d]!, next[i]!];
      return next;
    }, setFamilies);
  const removeFam = (i: number) => {
    const id = families[i]?.id;
    change<OptionFamily[]>((fs) => fs.filter((_, j) => j !== i), setFamilies);
    if (id)
      setRows(
        (rs) => rs?.map((r) => ({ ...r, families: r.families.filter((f) => f !== id) })) ?? rs,
      );
  };
  const addFam = () =>
    change<OptionFamily[]>((fs) => [...fs, { id: "", nombre: "", color: null }], setFamilies);
  const loadTemplate = () =>
    change<OptionFamily[]>(
      (fs) =>
        [...fs, ...COLOR_FAMILIES.filter((t) => !fs.some((f) => f.id === t.id))].slice(
          0,
          MAX_FAMILIES,
        ),
      setFamilies,
    );
  const toggle = (rowId: string, famId: string) =>
    change<Row[] | null>(
      (rs) =>
        rs?.map((r) =>
          r.id !== rowId
            ? r
            : {
                ...r,
                families: r.families.includes(famId)
                  ? r.families.filter((f) => f !== famId)
                  : [...r.families, famId],
              },
        ) ?? rs,
      setRows,
    );
  const setColor = (rowId: string, color: string | null) =>
    change<Row[] | null>(
      (rs) => rs?.map((r) => (r.id === rowId ? { ...r, color } : r)) ?? rs,
      setRows,
    );

  // Validación local (la ruta valida lo mismo con zod)
  const problems = useMemo(() => {
    const out: string[] = [];
    const ids = new Set<string>();
    families.forEach((f, i) => {
      const n = i + 1;
      if (!f.nombre.trim()) out.push(`Familia ${n}: falta el nombre.`);
      if (!FAMILY_ID_RE.test(f.id))
        out.push(`Familia ${n}: el id «${f.id}» no vale (minúsculas, números y guiones).`);
      else if (ids.has(f.id)) out.push(`Familia ${n}: id «${f.id}» repetido.`);
      ids.add(f.id);
    });
    return out;
  }, [families]);
  const valid = new Set(families.map((f) => f.id));
  const missing = (rows ?? []).filter((r) => !r.families.some((f) => valid.has(f)));

  const save = async () => {
    if (!rows) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = (await api(`/admin/option-families/${data.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familias: families.map((f) => ({ id: f.id, nombre: f.nombre.trim(), color: f.color })),
          valores: rows.map((r) => ({
            id: r.id,
            familias: r.families.filter((f) => valid.has(f)),
            color: r.color,
          })),
        }),
      })) as { option_updated?: boolean; values_updated?: number; without_family?: string[] };
      const left = res.without_family?.length ?? 0;
      setMsg({
        ok: true,
        text:
          `Guardado: ${res.option_updated ? "familias de la opción y " : ""}${res.values_updated ?? 0} valores. ` +
          "Se ve en /buscar/ en unos segundos y en las categorías tras el próximo build." +
          (left ? ` ${left} valores siguen sin familia (no saldrán en el filtro).` : ""),
      });
      // Lo guardado pasa a ser el estado de partida
      (data as { metadata?: Record<string, unknown> | null }).metadata = {
        ...(data.metadata ?? {}),
        familias: families,
      };
      setDirty(false);
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  if (exclusive) {
    return (
      <div className="shadow-elevation-card-rest bg-ui-bg-base rounded-lg px-6 py-4">
        <h2 className="font-sans text-base font-medium">Familias para los filtros de la tienda</h2>
        <p className="text-ui-fg-subtle mt-1 text-sm">
          Esta opción es exclusiva de un producto: no se agrupa en familias.
        </p>
      </div>
    );
  }

  const shown = onlyMissing ? missing : (rows ?? []);
  return (
    <div className="shadow-elevation-card-rest bg-ui-bg-base rounded-lg px-6 py-4">
      <h2 className="font-sans text-base font-medium">Familias para los filtros de la tienda</h2>
      <p className="text-ui-fg-subtle mt-1 text-sm">
        Agrupa los valores de esta opción (p. ej. los colores de cada marca) en familias para los
        filtros de las categorías y de /buscar/. La ficha y la búsqueda por texto siguen usando los
        nombres originales. Sin familias, el filtro enseña los valores tal cual.
      </p>

      {/* Familias */}
      <div className="mt-4 flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Familias ({families.length})</h3>
        <button type="button" className={secondary} onClick={loadTemplate} disabled={busy}>
          Cargar las 12 de color
        </button>
      </div>
      {families.length === 0 && (
        <p className="text-ui-fg-subtle mt-2 text-sm">
          Sin familias. Añade las tuyas o carga las 12 de color.
        </p>
      )}
      <ol className="mt-2 flex flex-col gap-2">
        {families.map((f, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2">
            <span className="flex flex-col">
              <button
                type="button"
                className="text-ui-fg-subtle px-1 text-xs leading-none disabled:opacity-30"
                aria-label={`Subir ${f.nombre || "familia"}`}
                disabled={busy || i === 0}
                onClick={() => move(i, -1)}
              >
                ▲
              </button>
              <button
                type="button"
                className="text-ui-fg-subtle px-1 text-xs leading-none disabled:opacity-30"
                aria-label={`Bajar ${f.nombre || "familia"}`}
                disabled={busy || i === families.length - 1}
                onClick={() => move(i, 1)}
              >
                ▼
              </button>
            </span>
            <label className="flex items-center gap-1 text-sm">
              Nombre
              <input
                className={`${input} w-40`}
                value={f.nombre}
                maxLength={40}
                disabled={busy}
                onChange={(e) => {
                  const nombre = e.target.value;
                  // El id sigue al nombre mientras no se haya tocado a mano
                  setFam(
                    i,
                    f.id === slug(f.nombre) || !f.id ? { nombre, id: slug(nombre) } : { nombre },
                  );
                }}
              />
            </label>
            <label className="flex items-center gap-1 text-sm">
              id
              <input
                className={`${input} w-36 font-mono ${f.id && !FAMILY_ID_RE.test(f.id) ? "border-ui-tag-red-border" : ""}`}
                value={f.id}
                maxLength={40}
                disabled={busy}
                onChange={(e) => setFam(i, { id: e.target.value.toLowerCase() })}
              />
            </label>
            <span className="text-sm">Color del filtro</span>
            <ColorField
              label={`Color de ${f.nombre || "la familia"}`}
              value={f.color}
              disabled={busy}
              onChange={(color) => setFam(i, { color })}
            />
            <button
              type="button"
              className={secondary}
              disabled={busy}
              onClick={() => removeFam(i)}
            >
              Quitar
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className={`${secondary} mt-2`}
        disabled={busy || families.length >= MAX_FAMILIES}
        onClick={addFam}
      >
        + Añadir familia
      </button>

      {/* Valores */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">
          Valores ({rows?.length ?? "…"})
          {families.length > 0 && missing.length > 0 && (
            <span className="text-ui-fg-error ml-2">· {missing.length} sin familia ⚠</span>
          )}
        </h3>
        <label className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={onlyMissing}
            onChange={(e) => setOnlyMissing(e.target.checked)}
          />
          Solo sin familia
        </label>
      </div>
      {rows === null ? (
        <p className="text-ui-fg-subtle mt-2 text-sm">Cargando valores…</p>
      ) : (
        <div className="border-ui-border-base mt-2 max-h-[32rem] overflow-auto rounded-md border">
          <table className="w-max min-w-full border-collapse text-sm">
            <thead className="bg-ui-bg-subtle sticky top-0 z-10">
              <tr>
                <th className="bg-ui-bg-subtle sticky left-0 z-10 px-3 py-2 text-left font-medium">
                  Valor
                </th>
                {families.map((f, i) => (
                  <th key={i} className="px-2 py-2 text-center font-medium" title={f.id}>
                    <span className="inline-flex items-center gap-1">
                      {f.color && (
                        <span
                          aria-hidden="true"
                          className="border-ui-border-base inline-block size-3 rounded-full border"
                          style={{ background: f.color }}
                        />
                      )}
                      {f.nombre || "—"}
                    </span>
                  </th>
                ))}
                <th
                  className="px-3 py-2 text-left font-medium"
                  title="Color de la muestra en el selector de la ficha (si el valor no tiene foto)"
                >
                  Muestra en la ficha
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const count = r.families.filter((f) => valid.has(f)).length;
                return (
                  <tr key={r.id} className="border-ui-border-base border-t">
                    <th
                      scope="row"
                      className="bg-ui-bg-base sticky left-0 px-3 py-1.5 text-left font-normal"
                    >
                      {r.value}
                    </th>
                    {families.map((f, i) => {
                      const on = r.families.includes(f.id);
                      return (
                        <td key={i} className="px-2 py-1.5 text-center">
                          <input
                            type="checkbox"
                            aria-label={`${r.value}: ${f.nombre || f.id}`}
                            checked={on}
                            disabled={busy || !f.id || (!on && count >= MAX_FAMILIES_PER_VALUE)}
                            onChange={() => toggle(r.id, f.id)}
                          />
                        </td>
                      );
                    })}
                    <td className="px-3 py-1.5">
                      <ColorField
                        label={`Muestra de ${r.value}`}
                        value={r.color}
                        disabled={busy}
                        onChange={(color) => setColor(r.id, color)}
                      />
                    </td>
                  </tr>
                );
              })}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={families.length + 2} className="text-ui-fg-subtle px-3 py-3">
                    {onlyMissing
                      ? "Todos los valores tienen familia."
                      : "Esta opción no tiene valores."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-ui-fg-subtle mt-2 text-xs">
        Hasta {MAX_FAMILIES_PER_VALUE} familias por valor (tonos frontera como «Sea Foam» pueden ir
        en verde y azul). La muestra es el color del botón del valor en la ficha cuando no tiene
        foto.
      </p>

      {problems.length > 0 && (
        <ul className="text-ui-fg-error mt-3 list-disc pl-5 text-sm">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {msg && (
        <p
          role="status"
          className={`mt-3 text-sm ${msg.ok ? "text-ui-fg-interactive" : "text-ui-fg-error"}`}
        >
          {msg.text}
        </p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          className={secondary}
          disabled={busy || !dirty}
          onClick={() => void load().then(() => setMsg(null))}
        >
          Descartar cambios
        </button>
        <button
          type="button"
          className={button}
          disabled={busy || !dirty || problems.length > 0 || rows === null}
          onClick={() => void save()}
        >
          {busy ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </div>
  );
};

export const config = defineWidgetConfig({ zone: "product_option.details.after" });

export default OptionFamiliesWidget;
