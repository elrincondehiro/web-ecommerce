// Selector de opciones de la ficha (Fase O). Funciones PURAS (Vitest).
// Con 2 opciones (o 1 cuyos valores tienen foto o color) la ficha enseña un grupo de muestras por
// opción en vez de la tabla de variantes (BuyBox). Funciona SIN JS:
//   - radios `opcion_1` / `opcion_2` con el valor «Título:valor» (mismo formato que
//     `option_values` del índice); la action `cart.add` busca la variante en el servidor
//     (`findVariantByOptions`), así un HTML de un build anterior no puede añadir otra variante;
//   - CSS por POSICIÓN (VariantPicker.astro, `data-ai`/`data-pa`): fotos y precios del valor
//     elegido de la opción A, tallas agotadas tachadas y Añadir ↔ Agotado. Las reglas son las
//     mismas para todos los productos (hasta MAX_VALUES valores por opción).
// Opción A (la de fuera, la que cambia las fotos): `metadata.opcion_fotos` → una con fotos o
// colores → la que no es de tallas → la primera. Opción B: la otra.
import { getProductPricing, type StoreProduct, type VariantAvailability } from "./catalog";
import { compareValues } from "./facets";

/** Tope de valores por opción (el CSS tiene reglas para 1..MAX_VALUES). Más → tabla. */
export const MAX_VALUES = 20;
/** Clave de metadata del valor de opción (Admin): color de la muestra, `#rrggbb`. */
export const VALUE_COLOR_KEY = "color";
/** Clave de metadata del producto: opción cuyas fotos cambian la galería (catalog:import). */
export const PHOTO_OPTION_KEY = "opcion_fotos";
/** Campos del formulario (opción A y B). */
export const OPTION_FIELDS = ["opcion_1", "opcion_2"] as const;

const HEX = /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i;
const SIZES = /^(xxs|xs|s|m|l|xl|xxl|xxxl|\d+)$/i;

export interface PickerValue {
  value: string;
  /** Valor del formulario: «Título:valor». */
  field: string;
  /** Color de la muestra (metadata del valor), o null. */
  color: string | null;
  /** Fotos propias del valor (solo en la opción A con `opcion_fotos`). */
  images: string[];
}

export interface PickerOption {
  title: string;
  values: PickerValue[];
}

export interface VariantPicker {
  a: PickerOption;
  b: PickerOption | null;
  /** cells[i][j] = variante de A[i] × B[j] (B ausente: j = 0), o null si no existe. */
  cells: (VariantAvailability | null)[][];
  /** Fotos que no son de ningún valor (salen siempre). */
  generalImages: string[];
  /** Posiciones preseleccionadas: la primera combinación con stock (o la primera que exista). */
  selected: { a: number; b: number };
  /** Varias variantes con precios distintos: cada talla enseña el suyo. */
  priceRange: boolean;
}

type Option = NonNullable<StoreProduct["options"]>[number];
type Variant = NonNullable<StoreProduct["variants"]>[number];

const str = (v: unknown) => (typeof v === "string" ? v : null);

function valueColor(v: { metadata?: Record<string, unknown> | null } | null | undefined) {
  const c = str(v?.metadata?.[VALUE_COLOR_KEY]);
  return c && HEX.test(c) ? c : null;
}

/** Valor de la variante en una opción (por id de opción o, si falta, por título). */
function variantValue(v: Variant, option: Option): string | null {
  for (const ov of v.options ?? []) {
    if (!ov) continue;
    if (ov.option_id === option.id || ov.option?.title === option.title) return ov.value ?? null;
  }
  return null;
}

function imageUrls(v: Variant): string[] {
  const imgs = (v as { images?: ({ url?: string | null; rank?: number | null } | null)[] | null })
    .images;
  return (imgs ?? [])
    .filter((i): i is { url: string; rank?: number | null } => Boolean(i?.url))
    .sort((x, y) => (x.rank ?? 0) - (y.rank ?? 0))
    .map((i) => i.url);
}

/**
 * Fotos por valor de la opción de fotos. Medusa (2.21.2, `variants.images`) da a cada variante
 * sus fotos MÁS las generales: las de un valor son las de sus variantes que no están en todas.
 */
function imagesByValue(
  variants: Variant[],
  option: Option,
  values: string[],
): { byValue: Map<string, string[]>; general: Set<string> } {
  const per = new Map<string, Set<string>>();
  for (const v of variants) {
    const value = variantValue(v, option);
    if (!value) continue;
    const set = per.get(value) ?? new Set<string>();
    for (const url of imageUrls(v)) set.add(url);
    per.set(value, set);
  }
  // Solo los valores con variantes (un valor sin variantes vaciaría la intersección)
  const sets = values.flatMap((v) => (per.has(v) ? [per.get(v)!] : []));
  const general = new Set([...(sets[0] ?? [])].filter((url) => sets.every((s) => s.has(url))));
  const byValue = new Map(
    values.map((v) => [v, [...(per.get(v) ?? [])].filter((url) => !general.has(url))]),
  );
  return { byValue, general };
}

const isSizeOption = (o: Option) =>
  (o.values ?? []).length > 0 && (o.values ?? []).every((v) => SIZES.test(v?.value ?? ""));

/** Selector de la ficha, o null si la ficha sigue con la tabla de variantes. */
export function buildVariantPicker(product: StoreProduct): VariantPicker | null {
  const pricing = getProductPricing(product);
  if (pricing.isBulk || pricing.variants.length < 2) return null;
  const options = (product.options ?? []).filter(
    (o): o is Option => Boolean(o) && (o!.values?.length ?? 0) > 0,
  );
  if (options.length < 1 || options.length > 2) return null;
  if (options.some((o) => (o.values?.length ?? 0) > MAX_VALUES)) return null;

  const variants = (product.variants ?? []).filter((v): v is Variant => Boolean(v));
  const photoTitle = str(product.metadata?.[PHOTO_OPTION_KEY]);
  const photo = options.find((o) => o.title === photoTitle) ?? null;
  const colored = options.find((o) => (o.values ?? []).some((v) => valueColor(v)));
  // Una opción: solo si sus valores tienen foto o color (si no, la tabla dice más: precio y stock)
  if (options.length === 1 && !photo && !colored) return null;
  const first = photo ?? colored ?? options.find((o) => !isSizeOption(o)) ?? (options[0] as Option);
  const second = options.find((o) => o !== first) ?? null;

  const sortedValues = (o: Option) =>
    (o.values ?? []).filter((v) => v?.value).sort((x, y) => compareValues(x!.value!, y!.value!));
  const aValues = sortedValues(first);
  const bValues = second ? sortedValues(second) : [];
  const { byValue, general } = photo
    ? imagesByValue(
        variants,
        photo,
        aValues.map((v) => v!.value!),
      )
    : { byValue: new Map<string, string[]>(), general: new Set<string>() };

  const toOption = (o: Option, values: typeof aValues, withImages: boolean): PickerOption => ({
    title: o.title ?? "",
    values: values.map((v) => ({
      value: v!.value!,
      field: `${o.title}:${v!.value}`,
      color: valueColor(v),
      images: withImages ? (byValue.get(v!.value!) ?? []) : [],
    })),
  });

  const availability = new Map(pricing.variants.map((v) => [v.id, v]));
  const cells = aValues.map((av) =>
    (second ? bValues : [null]).map((bv) => {
      const v = variants.find(
        (x) =>
          variantValue(x, first) === av!.value &&
          (!second || variantValue(x, second) === bv!.value),
      );
      return v ? (availability.get(v.id) ?? null) : null;
    }),
  );

  let selected = { a: 0, b: 0 };
  let found = false;
  for (const wantStock of [true, false]) {
    for (let i = 0; i < cells.length && !found; i++) {
      const row = cells[i] ?? [];
      for (let j = 0; j < row.length && !found; j++) {
        const c = row[j];
        if (c && (!wantStock || c.inStock)) {
          selected = { a: i, b: j };
          found = true;
        }
      }
    }
    if (found) break;
  }

  // Fotos generales: las del producto que no son de ningún valor (orden del producto).
  const valued = new Set([...byValue.values()].flat());
  const generalImages = photo
    ? [...general]
    : (product.images ?? []).map((i) => i?.url).filter((u): u is string => Boolean(u));
  const amounts = new Set(pricing.variants.map((v) => v.amount));

  return {
    a: toOption(first, aValues, Boolean(photo)),
    b: second ? toOption(second, bValues, false) : null,
    cells,
    generalImages: generalImages.filter((u) => !valued.has(u)),
    selected,
    priceRange: amounts.size > 1,
  };
}

/** «Talla:M» → { title: "Talla", value: "M" } (null si no tiene «:»). */
export function splitField(field: string): { title: string; value: string } | null {
  const i = field.indexOf(":");
  return i > 0 ? { title: field.slice(0, i), value: field.slice(i + 1) } : null;
}

/**
 * Variante del producto con exactamente esos valores (action `cart.add`, servidor). Tienen que
 * venir TODAS las opciones del producto; null si falta alguna, sobra o no existe la combinación.
 * `product` = `GET /store/products/:id` con `*options,variants.id,*variants.options`.
 */
export function findVariantByOptions(
  product: {
    options?: ({ id?: string | null; title?: string | null } | null)[] | null;
    variants?:
      | ({
          id: string;
          options?: ({ option_id?: string | null; value?: string | null } | null)[] | null;
        } | null)[]
      | null;
  },
  fields: readonly string[],
): string | null {
  const titleOf = new Map((product.options ?? []).map((o) => [o?.id, o?.title]));
  const wanted = new Map<string, string>();
  for (const f of fields) {
    const pair = splitField(f);
    if (!pair || wanted.has(pair.title)) return null;
    wanted.set(pair.title, pair.value);
  }
  if (!wanted.size || wanted.size !== titleOf.size) return null;
  const hit = (product.variants ?? []).find((v) => {
    const opts = (v?.options ?? []).filter(Boolean);
    return (
      opts.length === wanted.size &&
      opts.every((o) => {
        const title = titleOf.get(o!.option_id);
        return Boolean(title) && wanted.get(title!) === o!.value;
      })
    );
  });
  return hit?.id ?? null;
}

/**
 * CSS del selector (src/styles/variant-picker.css, generado: lo comprueba variant-picker.test.ts).
 * Por posición `i` del valor elegido de la opción A (`data-ai` en su radio, `data-pa` en lo que
 * depende de él: fotos, miniaturas y las celdas de cada talla). Sin `:has()` anidados (no los
 * admite CSS): el botón mira la celda HERMANA del radio de B marcado (`~`).
 *   1. lo de otros valores de A, oculto;
 *   2. talla agotada (con el A elegido) tachada; con una sola opción, la celda sin `data-pa`;
 *   3. combinación agotada → «Agotado» en vez de cantidad + Añadir (y la insignia de stock).
 */
export function pickerCss(n = MAX_VALUES): string {
  const range = Array.from({ length: n }, (_, k) => k + 1);
  const a = (i: number) => `.vp:has([data-ai="${i}"]:checked)`;
  const outCell = (i: number) => `[name=opcion_2]:checked~[data-pa="${i}"][data-vstock=out]`;
  const single = ".vp:has([name=opcion_1]:checked~[data-vstock=out]:not([data-pa]))";
  const hide = range.map((i) => `${a(i)} [data-pa]:not([data-pa="${i}"])`).join(",");
  const strike = [
    ...range.map((i) => `${a(i)} .vp-opt:has(>[data-pa="${i}"][data-vstock=out])`),
    ".vp-opt:has(>[data-vstock=out]:not([data-pa]))",
  ].join(",");
  const combo = [...range.map((i) => `${a(i)}:has(${outCell(i)})`), single];
  return (
    `${hide}{display:none}\n` +
    `${strike}{color:var(--muted-foreground);text-decoration:line-through}\n` +
    `${combo.map((s) => `${s} [data-if-stock=in]`).join(",")}{display:none!important}\n` +
    `${combo.map((s) => `${s} [data-if-stock=out]`).join(",")}{display:inline-flex!important}\n`
  );
}

/** Colores de las muestras (HeadStyle): `.vp [data-sw="a1"]{--sw:#c0392b}` (hex validado). */
export function pickerColorCss(picker: VariantPicker): string {
  const rules: string[] = [];
  for (const [key, option] of [
    ["a", picker.a],
    ["b", picker.b],
  ] as const) {
    option?.values.forEach((v, i) => {
      if (v.color) rules.push(`.vp [data-sw="${key}${i + 1}"]{--sw:${v.color}}`);
    });
  }
  return rules.join("");
}
