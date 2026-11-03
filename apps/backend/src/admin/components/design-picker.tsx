import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CATEGORY_DESIGNS,
  DESIGN_KEY,
  PRODUCT_DESIGNS,
  PRODUCTS_DESIGN_KEY,
  ownProductDesign,
  type ProductDesignInfo,
} from "../../lib/disenos";

/**
 * Diseños de la tienda en el Admin (Fase DS; lib/disenos.ts, igual que en el storefront).
 * - Producto: diseño de la ficha (`metadata.diseno`) o «heredado» del `diseno_productos` de su
 *   categoría más concreta y de sus padres. Los diseños reservados (correa: los pone
 *   `correas:sync`) no se ofrecen; si el producto lo tiene, se muestra sin poder cambiarlo.
 * - Categoría: diseño de su página (`diseno`) y el de sus productos (`diseno_productos`, solo los
 *   heredables).
 * Guarda con la API estándar del Admin (`POST /admin/products/:id`, `/admin/product-categories/
 * :id`). La metadata del producto se FUSIONA ("" borra la clave); la de la categoría se
 * SUSTITUYE (Medusa 2.22, comprobado en la Fase H: admin/components/entity-image.tsx), así que se
 * manda completa. El cambio se ve en la tienda tras el siguiente build.
 * Sin @medusajs/ui (no es dependencia directa del backend): HTML + clases del dashboard.
 */
type Meta = Record<string, unknown> | null | undefined;
type Category = {
  id: string;
  name: string;
  handle: string;
  parent_category_id: string | null;
  metadata: Meta;
};

const button =
  "bg-ui-button-inverted text-ui-fg-on-inverted rounded-md px-3 py-1.5 text-sm disabled:opacity-50";
const select = "rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1 text-sm";
const SAVED = "Guardado. Se verá en la tienda tras el próximo despliegue.";

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "");

async function api(url: string, init?: RequestInit) {
  const r = await fetch(url, { credentials: "include", ...init });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((json as { message?: string }).message ?? `Error ${r.status}`);
  return json as Record<string, unknown>;
}

const post = (url: string, body: unknown) =>
  api(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="shadow-elevation-card-rest bg-ui-bg-base rounded-lg px-6 py-4">
      <h2 className="font-sans text-base font-medium">{title}</h2>
      {children}
    </div>
  );
}

function Status({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return (
    <p
      role={msg.ok ? "status" : "alert"}
      className={`text-sm ${msg.ok ? "text-ui-fg-interactive" : "text-ui-fg-error"}`}
    >
      {msg.text}
    </p>
  );
}

const productOptions = (filter: (d: ProductDesignInfo) => boolean) =>
  Object.entries(PRODUCT_DESIGNS as Record<string, ProductDesignInfo>).filter(([, d]) => filter(d));

/** Diseño de la ficha de un producto. */
export function ProductDesignPicker({
  id,
  metadata,
  categoryIds,
}: {
  id: string;
  metadata: Meta;
  categoryIds: string[];
}) {
  const [meta, setMeta] = useState<Meta>(metadata);
  const [value, setValue] = useState(str(metadata?.[DESIGN_KEY]));
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const own = ownProductDesign(meta);
  const reserved =
    own && own in PRODUCT_DESIGNS ? PRODUCT_DESIGNS[own as "correa"].reservado : false;

  useEffect(() => {
    api("/admin/product-categories?limit=1000&fields=id,name,handle,parent_category_id,metadata")
      .then((r) => setCategories((r.product_categories as Category[]) ?? []))
      .catch(() => setCategories([]));
  }, []);

  // Heredado: el `diseno_productos` de la categoría más profunda del producto y de sus padres
  const inherited = useMemo(() => {
    if (!categories) return null;
    const byId = new Map(categories.map((c) => [c.id, c]));
    const chain = (c: Category) => {
      const out: Category[] = [];
      for (
        let n: Category | undefined = c;
        n;
        n = n.parent_category_id ? byId.get(n.parent_category_id) : undefined
      ) {
        out.push(n);
      }
      return out;
    };
    const deepest = categoryIds
      .map((cid) => byId.get(cid))
      .filter((c): c is Category => !!c)
      .map(chain)
      .sort((a, b) => b.length - a.length)[0];
    for (const c of deepest ?? []) {
      const d = str(c.metadata?.[PRODUCTS_DESIGN_KEY]);
      if (d) return { design: d, from: c.name };
    }
    return null;
  }, [categories, categoryIds]);

  const name = (d: string) =>
    (PRODUCT_DESIGNS as Record<string, ProductDesignInfo>)[d]?.nombre ?? d;
  const inheritedText = inherited
    ? `${name(inherited.design)} (de «${inherited.from}»)`
    : PRODUCT_DESIGNS.estandar.nombre;

  const onSave = () => {
    setBusy(true);
    setMsg(null);
    post(`/admin/products/${id}`, { metadata: { [DESIGN_KEY]: value } })
      .then((r) => {
        setMeta((r.product as { metadata?: Meta } | undefined)?.metadata ?? meta);
        setMsg({ ok: true, text: SAVED });
      })
      .catch((e: Error) => setMsg({ ok: false, text: e.message }))
      .finally(() => setBusy(false));
  };

  return (
    <Card title="Diseño de la ficha en la tienda">
      {reserved ? (
        <p className="text-ui-fg-subtle mt-1 text-sm">
          {name(own!)}: {(PRODUCT_DESIGNS as Record<string, ProductDesignInfo>)[own!]!.descripcion}{" "}
          No se cambia aquí.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-sm">
            Diseño
            <select
              className={select}
              value={value}
              disabled={busy}
              onChange={(e) => setValue(e.currentTarget.value)}
            >
              <option value="">Heredado: {categories ? inheritedText : "…"}</option>
              {productOptions((d) => !d.reservado).map(([k, d]) => (
                <option key={k} value={k}>
                  {d.nombre}
                </option>
              ))}
            </select>
          </label>
          <p className="text-ui-fg-subtle text-sm">
            {value
              ? (PRODUCT_DESIGNS as Record<string, ProductDesignInfo>)[value]?.descripcion
              : "Sin diseño propio: el de su categoría (o el estándar)."}
          </p>
          <div>
            <button type="button" className={button} disabled={busy} onClick={onSave}>
              {busy ? "Guardando…" : "Guardar"}
            </button>
          </div>
          <Status msg={msg} />
        </div>
      )}
    </Card>
  );
}

/** Diseño de la página de una categoría y el de sus productos. */
export function CategoryDesignPicker({ id, metadata }: { id: string; metadata: Meta }) {
  const [meta, setMeta] = useState<Meta>(metadata);
  const [page, setPage] = useState(str(metadata?.[DESIGN_KEY]));
  const [products, setProducts] = useState(str(metadata?.[PRODUCTS_DESIGN_KEY]));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const onSave = () => {
    // Metadata COMPLETA (se sustituye): las demás claves (foto de la Fase H) se conservan
    const next: Record<string, unknown> = { ...(meta ?? {}) };
    delete next[DESIGN_KEY];
    delete next[PRODUCTS_DESIGN_KEY];
    if (page) next[DESIGN_KEY] = page;
    if (products) next[PRODUCTS_DESIGN_KEY] = products;
    setBusy(true);
    setMsg(null);
    post(`/admin/product-categories/${id}`, { metadata: next })
      .then((r) => {
        setMeta((r.product_category as { metadata?: Meta } | undefined)?.metadata ?? next);
        setMsg({ ok: true, text: SAVED });
      })
      .catch((e: Error) => setMsg({ ok: false, text: e.message }))
      .finally(() => setBusy(false));
  };

  return (
    <Card title="Diseños en la tienda">
      <div className="mt-3 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Página de la categoría (no pasa a sus subcategorías)
          <select
            className={select}
            value={page}
            disabled={busy}
            onChange={(e) => setPage(e.currentTarget.value)}
          >
            <option value="">{CATEGORY_DESIGNS.estandar.nombre} (por defecto)</option>
            {Object.entries(CATEGORY_DESIGNS)
              .filter(([k]) => k !== "estandar")
              .map(([k, d]) => (
                <option key={k} value={k}>
                  {d.nombre}
                </option>
              ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Fichas de sus productos (también los de sus subcategorías, salvo que tengan uno propio)
          <select
            className={select}
            value={products}
            disabled={busy}
            onChange={(e) => setProducts(e.currentTarget.value)}
          >
            <option value="">Heredado de la categoría padre (o estándar)</option>
            {productOptions((d) => d.heredable).map(([k, d]) => (
              <option key={k} value={k}>
                {d.nombre}
              </option>
            ))}
          </select>
        </label>
        <div>
          <button type="button" className={button} disabled={busy} onClick={onSave}>
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </div>
        <Status msg={msg} />
      </div>
    </Card>
  );
}
