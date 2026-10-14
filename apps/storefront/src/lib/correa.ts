// Correa a medida (Fase E-2c). Funciones PURAS sobre los productos que genera `correas:sync`
// (backend: src/scripts/correas-sync.ts y src/lib/correas.ts, mismas claves de metadata):
//   - un producto por color × material (`metadata.plantilla = "correa"`, `grupo = "correa"`);
//   - una variante por largo × mosquetón lado perro × lado mano (`variant.metadata`: `largo_m`,
//     `mosqueton_perro`, `mosqueton_mano`), cada una un inventory kit de piezas.
// Listados y búsqueda: las correas salen como UNA tarjeta («Correa a medida», `groupCorreas`) que
// lleva a la página de grupo /producto/correa-a-medida/. La ficha de cada color pinta el
// configurador con el modelo de precio aditivo (`correaModel`): base del largo + recargo de cada
// mosquetón. El build falla si algún precio de Medusa no cumple ese modelo.
// Disponibilidad: máscaras de 9 bits por largo (lado perro × lado mano), sin cantidades.
import { isVariantInStock, variantAmount, type StoreProduct, type StoreVariant } from "./catalog";

export const CORREA_TEMPLATE = "correa";
/** Handle (y id) de la página de grupo; ningún producto puede usarlo (lo comprueba el build). */
export const CORREA_GROUP_HANDLE = "correa-a-medida";
export const CORREA_GROUP_ID = CORREA_GROUP_HANDLE;
export const CORREA_GROUP_PATH = `/producto/${CORREA_GROUP_HANDLE}/`;
export const CORREA_GROUP_TITLE = "Correa a medida";

const META = { length: "largo_m", dog: "mosqueton_perro", hand: "mosqueton_mano" } as const;
/** Claves de `line_item.metadata` (las valida el backend: hook validar-carrito). */
export const CORREA_LINE_META = { notes: "observaciones", exactCm: "medida_cm" } as const;
export const NOTES_MAX = 200;
const OPTION_DOG = "Mosquetón lado perro";

export function isCorrea(product: Pick<StoreProduct, "metadata">): boolean {
  return product.metadata?.["plantilla"] === CORREA_TEMPLATE;
}

/** Tarjeta sintética del grupo (listados y búsqueda). */
export function isCorreaGroup(product: Pick<StoreProduct, "id">): boolean {
  return product.id === CORREA_GROUP_ID;
}

const str = (v: unknown) => (typeof v === "string" && v ? v : null);

export function correaColor(product: Pick<StoreProduct, "metadata">): string | null {
  return str(product.metadata?.["color"]);
}
export function correaMaterial(product: Pick<StoreProduct, "metadata">): string | null {
  return str(product.metadata?.["material"]);
}

const HEX = /^#[0-9A-Fa-f]{6}$/;

/** Color de la muestra (`metadata.color_hex`, correas:sync) o null. */
export function correaHex(product: Pick<StoreProduct, "metadata">): string | null {
  const v = product.metadata?.["color_hex"];
  return typeof v === "string" && HEX.test(v) ? v.toUpperCase() : null;
}

/** Muestra de color de una correa (selector de la landing y de la ficha). */
export interface CorreaSwatch {
  handle: string;
  color: string;
  material: string;
  hex: string | null;
}

export function correaSwatch(p: StoreProduct): CorreaSwatch {
  return {
    handle: p.handle,
    color: correaColor(p) ?? p.title,
    material: correaMaterial(p) ?? "",
    hex: correaHex(p),
  };
}

/** Clase CSS de la muestra de un handle (lo pinta SwatchStyles). */
export const swatchClass = (handle: string) => `sw-${handle}`;

/**
 * CSS de las muestras: una regla por handle con su color (sin `style` en línea: con la CSP de la
 * fase 11 un atributo `style` necesitaría `style-src-attr`). Los handles son [a-z0-9-] y los
 * colores, #RRGGBB validados: no hay nada que escapar.
 */
export function swatchCss(swatches: readonly CorreaSwatch[], picker = false): string {
  const colors = swatches
    .filter((s) => s.hex)
    .map((s) => `.${swatchClass(s.handle)}{--sw:${s.hex}}`);
  // Landing: con una elegida, solo su CTA (global.css oculta los demás con :has())
  const ctas = picker
    ? swatches.map(
        (s) =>
          `.correa-pick:has([value="${s.handle}"]:checked) [data-cta="${s.handle}"]{display:inline-flex}`,
      )
    : [];
  return [...colors, ...ctas].join("");
}

/**
 * Correas de la tabla de precios de la landing: la primera de cada material (correas:sync da la
 * misma fórmula a todos los colores del mismo material).
 */
export function tableProducts(members: readonly StoreProduct[]): StoreProduct[] {
  const seen = new Set<string>();
  return members.filter((p) => {
    const key = correaMaterial(p) ?? p.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Clave de LiveSync del «hasta 8 m» / «Agotada» de un color en la landing (`data-price`). */
export const maxKey = (handle: string) => `${handle}_max`;
export const maxText = (m: number | undefined) => (m ? `hasta ${m} m` : "Agotada");

/** Muestras agrupadas por material (orden de aparición). */
export function swatchesByMaterial(
  swatches: readonly CorreaSwatch[],
): [material: string, swatches: CorreaSwatch[]][] {
  const out = new Map<string, CorreaSwatch[]>();
  for (const s of swatches) out.set(s.material, [...(out.get(s.material) ?? []), s]);
  return [...out];
}

interface VariantKey {
  m: number;
  dog: string;
  hand: string;
}

function variantKey(v: StoreVariant): VariantKey | null {
  const md = v.metadata ?? {};
  const m = md[META.length];
  const dog = str(md[META.dog]);
  const hand = str(md[META.hand]);
  if (typeof m !== "number" || !Number.isInteger(m) || m <= 0 || !dog || !hand) return null;
  return { m, dog, hand };
}

const comboKey = (m: number, dog: string, hand: string) => `${m}|${dog}|${hand}`;
const cents = (n: number) => Math.round(n * 100);

export interface CorreaClip {
  code: string;
  name: string;
  /** Recargo por mosquetón (euros con IVA), 0 en el más barato. */
  surcharge: number;
}

export interface CorreaModel {
  currency: string;
  /** Largos (m) en orden, con el precio con los dos mosquetones más baratos. */
  lengths: { m: number; base: number }[];
  /** Mosquetones por recargo (y código). */
  clips: CorreaClip[];
  /** largo|perro|mano → variante. */
  variants: Map<string, StoreVariant>;
}

/** Nombre del mosquetón de lado perro de una variante (opción o, si no viene, el título). */
function dogClipName(v: StoreVariant): string | null {
  const opt = v.options?.find((o) => o.option?.title === OPTION_DOG)?.value;
  return str(opt) ?? str(v.title?.split(" / ")[1]?.trim());
}

/**
 * Modelo de la ficha: largos, mosquetones y precio aditivo. Lanza un error (falla el build) si
 * falta una combinación o algún precio no es base(largo) + recargo(perro) + recargo(mano): el
 * configurador calcula el precio con esa fórmula y no debe mostrar otro que el del carrito.
 */
export function correaModel(product: StoreProduct): CorreaModel {
  const fail = (msg: string): never => {
    throw new Error(`Correa «${product.handle}»: ${msg}`);
  };
  const variants = new Map<string, StoreVariant>();
  const lengths = new Set<number>();
  const names = new Map<string, string>();
  let currency: string | null = null;
  for (const v of product.variants ?? []) {
    const k = variantKey(v);
    if (!k) fail(`la variante ${v.sku ?? v.id} no tiene largo y mosquetones en la metadata`);
    const { m, dog, hand } = k!;
    variants.set(comboKey(m, dog, hand), v);
    lengths.add(m);
    // Nombre: de la opción del lado perro (el del lado mano es la misma lista de mosquetones)
    if (!names.get(dog) || names.get(dog) === dog) names.set(dog, dogClipName(v) ?? dog);
    if (!names.has(hand)) names.set(hand, hand);
    currency ??= v.calculated_price?.currency_code ?? null;
  }
  const codes = [...names.keys()];
  const ms = [...lengths].sort((a, b) => a - b);
  if (!ms.length || !codes.length) fail("no tiene variantes");
  const price = (m: number, dog: string, hand: string) => {
    const v = variants.get(comboKey(m, dog, hand));
    if (!v) return fail(`falta la variante ${m} m / ${dog} / ${hand}`);
    const a = variantAmount(v);
    if (a === null) return fail(`la variante ${v.sku ?? v.id} no tiene precio`);
    return cents(a);
  };
  const m0 = ms[0]!;
  const c0 = codes.reduce((best, c) => (price(m0, c, c) < price(m0, best, best) ? c : best));
  const sur = new Map(codes.map((c) => [c, price(m0, c, c0) - price(m0, c0, c0)]));
  const base = new Map(ms.map((m) => [m, price(m, c0, c0)]));
  for (const m of ms)
    for (const d of codes)
      for (const h of codes) {
        const want = base.get(m)! + sur.get(d)! + sur.get(h)!;
        if (price(m, d, h) !== want) {
          fail(
            `el precio de ${m} m / ${d} / ${h} (${price(m, d, h) / 100} €) no es base + recargos ` +
              `(${want / 100} €). El configurador usa esa fórmula: revisa las hojas de correas:sync ` +
              "(las ofertas por variante no se admiten en las correas).",
          );
        }
      }
  const clips = codes
    .map((code) => ({ code, name: names.get(code)!, surcharge: sur.get(code)! / 100 }))
    .sort((a, b) => a.surcharge - b.surcharge || a.code.localeCompare(b.code));
  return {
    currency: currency ?? "eur",
    lengths: ms.map((m) => ({ m, base: base.get(m)! / 100 })),
    clips,
    variants,
  };
}

/** Disponibilidad: códigos de mosquetón en orden y, por largo, máscara de bits perro × mano. */
export interface CorreaMasks {
  c: string[];
  m: Record<string, number>;
}

/**
 * Máscaras a partir del stock de las variantes (`inventory_quantity` de un kit = correas que se
 * pueden hacer). `order`: orden de los códigos (el del modelo); si no, el de aparición. Bit de
 * (perro, mano) = índice(perro) × nº + índice(mano). Solo indicadores, nunca cantidades.
 */
export function correaMasks(product: StoreProduct, order?: readonly string[]): CorreaMasks {
  const keyed = (product.variants ?? []).flatMap((v) => {
    const k = variantKey(v);
    return k ? [{ k, v }] : [];
  });
  const c = order ? [...order] : [];
  if (!order)
    for (const { k } of keyed) for (const x of [k.dog, k.hand]) if (!c.includes(x)) c.push(x);
  const m: Record<string, number> = {};
  for (const { k, v } of keyed) {
    const i = c.indexOf(k.dog);
    const j = c.indexOf(k.hand);
    m[k.m] ??= 0;
    if (i >= 0 && j >= 0 && isVariantInStock(v)) m[k.m]! |= 1 << (i * c.length + j);
  }
  return { c, m };
}

/** Largo más largo con alguna combinación disponible (0 = agotada): «hasta 8 m». */
export function maxLength(product: StoreProduct): number {
  const masks = correaMasks(product).m;
  return Math.max(0, ...Object.entries(masks).flatMap(([l, bits]) => (bits ? [Number(l)] : [])));
}

/** Variante de una combinación (la resuelve el servidor en la action; nunca la manda el cliente). */
export function findCorreaVariant(
  variants: readonly { id: string; metadata?: Record<string, unknown> | null }[],
  m: number,
  dog: string,
  hand: string,
): string | null {
  return (
    variants.find((v) => {
      const md = v.metadata ?? {};
      return md[META.length] === m && md[META.dog] === dog && md[META.hand] === hand;
    })?.id ?? null
  );
}

/**
 * Datos del configurador (atributo `data-correa` del build y extra de LiveSync): códigos de
 * mosquetón, largos, precio base de cada largo y recargo de cada mosquetón en CÉNTIMOS, y
 * máscaras de disponibilidad. CorreaLive calcula precio = b[largo] + s[perro] + s[mano].
 */
export interface CorreaLiveData {
  c: string[];
  l: number[];
  b: number[];
  s: number[];
  m: Record<string, number>;
}

export function correaLiveData(
  product: StoreProduct,
  model = correaModel(product),
): CorreaLiveData {
  const c = model.clips.map((x) => x.code);
  return {
    c,
    l: model.lengths.map((x) => x.m),
    b: model.lengths.map((x) => cents(x.base)),
    s: model.clips.map((x) => cents(x.surcharge)),
    m: correaMasks(product, c).m,
  };
}

// ── Medida exacta y observaciones ─────────────────────────────────────────────────────────

/** Medida exacta válida para un largo: (largo − 1) m < medida ≤ largo m, en centímetros. */
export function exactRange(lengthM: number): { minCm: number; maxCm: number } {
  return { minCm: (lengthM - 1) * 100 + 1, maxCm: lengthM * 100 };
}

/** «6,40 m». */
export function formatMeters(cm: number): string {
  return `${(cm / 100).toFixed(2).replace(".", ",")} m`;
}

// eslint-disable-next-line no-control-regex -- se rechazan caracteres de control a propósito
const CONTROL = /[\u0000-\u0009\u000b-\u001f\u007f]/;

/** Observaciones limpias (saltos de línea normalizados, sin espacios sobrantes), null si vacías o `false` si no son válidas. */
export function cleanNotes(raw: string | null | undefined): string | null | false {
  const s = (raw ?? "").replace(/\r\n?/g, "\n").trim();
  if (!s) return null;
  if ([...s].length > NOTES_MAX || CONTROL.test(s)) return false;
  return s;
}

/** Líneas extra de una línea de carrito o pedido («Medida exacta: 6,40 m», «Observaciones: …»). */
export function lineDetails(metadata: Record<string, unknown> | null | undefined): string[] {
  const out: string[] = [];
  const cm = metadata?.[CORREA_LINE_META.exactCm];
  if (typeof cm === "number" && Number.isInteger(cm) && cm > 0) {
    out.push(`Medida exacta: ${formatMeters(cm)}`);
  }
  const notes = metadata?.[CORREA_LINE_META.notes];
  if (typeof notes === "string" && notes.trim()) out.push(`Observaciones: ${notes.trim()}`);
  return out;
}

// ── Agrupación en listados y búsqueda ─────────────────────────────────────────────────────

/** «Azul, Verde y Rojo» (orden de aparición, sin repetidos). */
export function joinList(values: readonly string[]): string {
  const u = [...new Set(values)];
  return u.length < 2 ? (u[0] ?? "") : `${u.slice(0, -1).join(", ")} y ${u.at(-1)}`;
}

/**
 * Producto sintético del grupo: la tarjeta «Correa a medida» (CorreaGroupCard). Lleva las
 * categorías de las correas (árbol de la tienda, listados por categoría), la primera miniatura y
 * TODAS sus variantes (precio «Desde» y rango de precio de las facetas). Sin opciones ni
 * etiquetas: no aporta facetas propias.
 */
export function correaGroupProduct(members: readonly StoreProduct[]): StoreProduct {
  const categories = new Map(
    members.flatMap((m) => (m.categories ?? []).flatMap((c) => (c ? [[c.id, c] as const] : []))),
  );
  const colors = members.flatMap((m) => correaColor(m) ?? []);
  const materials = members.flatMap((m) => correaMaterial(m)?.toLowerCase() ?? []);
  const withImage = members.find((m) => m.thumbnail ?? m.images?.[0]?.url);
  const updated = members
    .map((m) => m.updated_at)
    .filter((d): d is string => typeof d === "string")
    .sort()
    .at(-1);
  return {
    id: CORREA_GROUP_ID,
    handle: CORREA_GROUP_HANDLE,
    title: CORREA_GROUP_TITLE,
    subtitle: [joinList(colors), joinList(materials).replace(/ y /, " o ")]
      .filter(Boolean)
      .join(" · "),
    description: null,
    thumbnail: withImage ? (withImage.thumbnail ?? withImage.images?.[0]?.url ?? null) : null,
    images: [],
    collection_id: members.find((m) => m.collection_id)?.collection_id ?? null,
    metadata: { grupo: CORREA_TEMPLATE, miembros: members.length },
    categories: [...categories.values()],
    options: [],
    tags: [],
    variants: members.flatMap((m) => m.variants ?? []),
    ...(updated ? { updated_at: updated } : {}),
  } as unknown as StoreProduct;
}

/**
 * Sustituye las correas de una lista por la tarjeta del grupo, en el sitio de la primera.
 * `min`: nº mínimo de correas para agrupar (búsqueda: 2; con una sola, su ficha directamente).
 */
export function groupCorreas(products: StoreProduct[], min = 1): StoreProduct[] {
  const members = products.filter(isCorrea);
  if (members.length < min) return products;
  const group = correaGroupProduct(members);
  const out: StoreProduct[] = [];
  let placed = false;
  for (const p of products) {
    if (!isCorrea(p)) out.push(p);
    else if (!placed) {
      out.push(group);
      placed = true;
    }
  }
  return out;
}

// ── Tarjetas en vivo (LiveSync de listados y búsqueda) ────────────────────────────────────

/**
 * Datos de las tarjetas de correa que el servidor necesita en runtime sin pedir los productos
 * enteros (117 variantes con stock: ~170 KB y ~95 ms por correa). Para precio «Desde» y stock
 * basta el LARGO MÁS CORTO: lleva las mismas piezas con menos cuerda, así que si hay alguna
 * combinación disponible, la del largo más corto con esos mosquetones también lo está, y es la
 * más barata. Lo escribe el build (src/pages/listados/correas.json.ts → dist/server).
 */
export interface CorreaCard {
  handle: string;
  title: string;
  subtitle: string | null;
  thumbnail: string | null;
  /** Ids de las variantes del largo más corto. */
  v: string[];
  /** Solo colores: largo → variante con los mosquetones más baratos (tabla de precios). */
  t?: Record<string, string>;
  /** Solo colores: mosquetón → variante (largo más corto, ese mosquetón lado perro, el más barato lado mano). */
  k?: Record<string, string>;
}

export interface CorreaCards {
  /** Tarjeta del grupo (unión de las de cada color). */
  group: CorreaCard;
  /** Por id de producto. */
  members: Record<string, CorreaCard>;
}

export const CORREA_CARDS_MANIFEST = "correa-cards.json";

function shortestVariantIds(p: StoreProduct): string[] {
  const keyed = (p.variants ?? []).flatMap((v) => {
    const k = variantKey(v);
    return k ? [{ m: k.m, id: v.id }] : [];
  });
  const min = Math.min(...keyed.map((k) => k.m));
  return keyed.filter((k) => k.m === min).map((k) => k.id);
}

export function correaCards(listed: readonly StoreProduct[]): CorreaCards | null {
  const members = listed.filter(isCorrea);
  if (!members.length) return null;
  const card = (p: StoreProduct, v: string[]): CorreaCard => ({
    handle: p.handle,
    title: p.title,
    subtitle: p.subtitle ?? null,
    thumbnail: p.thumbnail ?? p.images?.[0]?.url ?? null,
    v,
  });
  const byId = Object.fromEntries(
    members.map((m) => {
      const model = correaModel(m);
      const c0 = model.clips[0]!.code;
      const m0 = model.lengths[0]!.m;
      const vid = (l: number, d: string, h: string) => model.variants.get(comboKey(l, d, h))!.id;
      return [
        m.id,
        {
          ...card(m, shortestVariantIds(m)),
          t: Object.fromEntries(model.lengths.map((l) => [l.m, vid(l.m, c0, c0)])),
          k: Object.fromEntries(model.clips.map((c) => [c.code, vid(m0, c.code, c0)])),
        },
      ];
    }),
  );
  return {
    group: card(
      correaGroupProduct(members),
      Object.values(byId).flatMap((c) => c.v),
    ),
    members: byId,
  };
}

/** Ids de variantes de la tabla de precios de una correa (landing): 13 largos + 3 mosquetones. */
export function tableVariantIds(card: CorreaCard): string[] {
  return [...new Set([...Object.values(card.t ?? {}), ...Object.values(card.k ?? {})])];
}

/**
 * Precios de la tabla de una correa (página de grupo, E-2c) con las variantes frescas: largo →
 * precio con los mosquetones más baratos, y recargo de cada mosquetón. Sin precio → se omite.
 */
export function cardTablePrices(
  card: CorreaCard,
  variants: readonly StoreVariant[],
): { lengths: [number, number][]; clips: [string, number][] } {
  const byId = new Map(variants.map((v) => [v.id, v]));
  const amount = (id: string | undefined) => {
    const v = id ? byId.get(id) : undefined;
    return v ? variantAmount(v) : null;
  };
  const lengths = Object.entries(card.t ?? {}).flatMap(([m, id]) => {
    const a = amount(id);
    return a === null ? [] : [[Number(m), a] as [number, number]];
  });
  const m0 = Math.min(...Object.keys(card.t ?? {}).map(Number));
  const base = amount(card.t?.[m0]);
  const clips = Object.entries(card.k ?? {}).flatMap(([code, id]) => {
    const a = amount(id);
    return a === null || base === null
      ? []
      : [[code, (cents(a) - cents(base)) / 100] as [string, number]];
  });
  return { lengths, clips };
}

/** Producto mínimo de una tarjeta (id + datos de la tarjeta + variantes frescas). */
export function cardProduct(
  id: string,
  card: CorreaCard,
  variants: readonly StoreVariant[],
): StoreProduct {
  const set = new Set(card.v);
  return {
    id,
    handle: card.handle,
    title: card.title,
    subtitle: card.subtitle,
    thumbnail: card.thumbnail,
    images: [],
    metadata: id === CORREA_GROUP_ID ? { grupo: CORREA_TEMPLATE } : { plantilla: CORREA_TEMPLATE },
    variants: variants.filter((v) => set.has(v.id)),
  } as unknown as StoreProduct;
}

/** Títulos de opción de las correas: no se ofrecen como filtro (la tarjeta es el grupo). */
export const CORREA_OPTION_TITLES = new Set([
  "Largo",
  "Mosquetón lado perro",
  "Mosquetón lado mano",
]);

/**
 * Resultados de búsqueda: con ≥ 2 correas, una tarjeta de grupo en el sitio de la primera; con
 * una, la suya. Devuelve los ids a mostrar (los de correa se pintan con `cardProduct`).
 */
export function groupSearchIds(ids: readonly string[], cards: CorreaCards | null): string[] {
  if (!cards) return [...ids];
  const hits = ids.filter((id) => id in cards.members);
  if (hits.length < 2) return [...ids];
  const out: string[] = [];
  for (const id of ids) {
    if (!(id in cards.members)) out.push(id);
    else if (id === hits[0]) out.push(CORREA_GROUP_ID);
  }
  return out;
}

/** Clave de LiveSync del precio de un largo en la tabla de la ficha (`data-price`). */
export const lengthPriceKey = (productId: string, m: number) => `${productId}_L${m}`;
/** Clave de LiveSync del recargo de un mosquetón en la ficha (`data-price`). */
export const clipPriceKey = (productId: string, code: string) => `${productId}_S${code}`;
