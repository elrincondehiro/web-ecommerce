/**
 * Plan de `correas:sync` (Fase E-2). Funciones puras: de las hojas (`correas-sheet.ts`) a los
 * productos deseados y su diferencia con lo que hay en Medusa.
 *
 * Cada fila de `correas.csv` es un producto con una variante por largo × mosquetón lado perro ×
 * mosquetón lado mano (13 × 3 × 3 = 117 con la plantilla). Cada variante es un inventory kit:
 *   - cuerda del producto: largo + `cuerda_extra_m` metros (decimales: el inventario es numérico);
 *   - un mosquetón de cada lado (2 del mismo si coinciden: un solo enlace con cantidad 2);
 *   - las piezas de `piezas.csv` (anillas, hebillas…) con su `por_correa`.
 * Precio = precio_3m + suplemento del largo + recargo de cada mosquetón. Peso = peso_fijo_g +
 * gramos_m × largo.
 */
import { CORREA_GROUP, CORREA_TEMPLATE, CORREA_VARIANT_META } from "../../lib/correas";
import type { CorreaClip, CorreaProductSheet, CorreaSheets } from "./correas-sheet";

export const OPTION_LENGTH = "Largo";
export const OPTION_DOG = "Mosquetón lado perro";
export const OPTION_HAND = "Mosquetón lado mano";
export const OPTION_TITLES = [OPTION_LENGTH, OPTION_DOG, OPTION_HAND] as const;
export const ROPE_UNIT = "m";

export const lengthValue = (m: number) => `${m} m`;
const cents = (n: number) => Math.round(n * 100);
const euros = (c: number) => c / 100;

export interface PieceWanted {
  sku: string;
  title: string;
  unit: string | null;
  stock: number;
}

export interface KitEntry {
  sku: string;
  quantity: number;
}

export interface VariantWanted {
  sku: string;
  title: string;
  options: Record<string, string>;
  price: number;
  weight: number;
  metadata: Record<string, unknown>;
  kit: KitEntry[];
}

export interface ProductWanted {
  handle: string;
  title: string;
  description: string | null;
  material: string;
  status: CorreaProductSheet["status"];
  metadata: Record<string, unknown>;
  options: { title: string; values: string[] }[];
  variants: VariantWanted[];
}

export interface CorreaWanted {
  category: string;
  pieces: PieceWanted[];
  products: ProductWanted[];
}

/** SKU de variante: handle en mayúsculas + largo (2 cifras) + códigos de mosquetón. */
export const variantSku = (handle: string, m: number, dog: string, hand: string) =>
  `${handle.toUpperCase()}-${String(m).padStart(2, "0")}-${dog}-${hand}`;

export function correaPrice(
  base: number,
  supplement: number,
  dog: Pick<CorreaClip, "surcharge">,
  hand: Pick<CorreaClip, "surcharge">,
) {
  return euros(cents(base) + cents(supplement) + cents(dog.surcharge) + cents(hand.surcharge));
}

export function buildWanted(sheets: CorreaSheets): CorreaWanted {
  const { settings, lengths, clips, parts, products } = sheets;
  const pieces: PieceWanted[] = [
    ...products.map((p) => ({
      sku: p.ropeSku,
      title: `Cuerda ${p.color} ${p.material} (metros)`,
      unit: ROPE_UNIT,
      stock: p.stock,
    })),
    ...clips.map((c) => ({
      sku: c.sku,
      title: `Mosquetón ${c.name}`,
      unit: null,
      stock: c.stock,
    })),
    ...parts.map((p) => ({ sku: p.sku, title: p.name, unit: null, stock: p.stock })),
  ];
  return {
    category: settings.category,
    pieces,
    products: products.map((p) => ({
      handle: p.handle,
      title: p.title,
      description: p.description,
      material: p.material,
      status: p.status,
      metadata: {
        plantilla: CORREA_TEMPLATE,
        grupo: CORREA_GROUP,
        color: p.color,
        ...(p.colorHex ? { color_hex: p.colorHex } : {}),
        material: p.material,
      },
      options: [
        { title: OPTION_LENGTH, values: lengths.map((l) => lengthValue(l.m)) },
        { title: OPTION_DOG, values: clips.map((c) => c.name) },
        { title: OPTION_HAND, values: clips.map((c) => c.name) },
      ],
      variants: lengths.flatMap((l) =>
        clips.flatMap((dog) =>
          clips.map((hand) => {
            const kit = new Map<string, number>([
              [p.ropeSku, Math.round((l.m + settings.extraM) * 1000) / 1000],
            ]);
            for (const c of [dog, hand]) kit.set(c.sku, (kit.get(c.sku) ?? 0) + 1);
            for (const part of parts) kit.set(part.sku, (kit.get(part.sku) ?? 0) + part.perCorrea);
            return {
              sku: variantSku(p.handle, l.m, dog.code, hand.code),
              title: `${lengthValue(l.m)} / ${dog.name} / ${hand.name}`,
              options: {
                [OPTION_LENGTH]: lengthValue(l.m),
                [OPTION_DOG]: dog.name,
                [OPTION_HAND]: hand.name,
              },
              price: correaPrice(p.basePrice, l.supplement, dog, hand),
              weight: settings.fixedG + p.gramsPerM * l.m,
              metadata: {
                [CORREA_VARIANT_META.length]: l.m,
                [CORREA_VARIANT_META.dogClip]: dog.code,
                [CORREA_VARIANT_META.handClip]: hand.code,
              },
              kit: [...kit].map(([sku, quantity]) => ({ sku, quantity })),
            };
          }),
        ),
      ),
    })),
  };
}

// ── Diferencias con Medusa ──────────────────────────────────────────────────

export interface DbPiece {
  id: string;
  sku: string;
  title: string | null;
  unit: string | null;
}

export interface DbCorreaVariant {
  id: string;
  sku: string;
  title: string;
  options: Record<string, string>;
  /** Precio base EUR (sin reglas) y su id. */
  basePrice: { id: string; amount: number } | null;
  weight: number | null;
  metadata: Record<string, unknown>;
  /** inventory_item_id → required_quantity */
  kit: Map<string, number>;
}

export interface DbCorreaProduct {
  id: string;
  handle: string;
  title: string;
  description: string | null;
  material: string | null;
  status: string;
  metadata: Record<string, unknown>;
  categoryIds: string[];
  /** título → { id, valores } */
  options: Map<string, { id: string; values: string[] }>;
  variants: DbCorreaVariant[];
}

export interface VariantChange {
  db: DbCorreaVariant;
  want: VariantWanted;
  changes: ("precio" | "peso" | "opciones" | "metadata" | "kit")[];
}

export interface ProductChange {
  db: DbCorreaProduct;
  want: ProductWanted;
  changes: string[];
  /** Opción (id) → valores que faltan. */
  addValues: { optionId: string; title: string; values: string[] }[];
  missingOptions: string[];
  create: VariantWanted[];
  update: VariantChange[];
  remove: DbCorreaVariant[];
}

export interface CorreaPlan {
  pieces: { create: PieceWanted[]; rename: { db: DbPiece; title: string }[] };
  products: { create: ProductWanted[]; update: ProductChange[]; unchanged: number };
  errors: string[];
}

const sameJson = (a: Record<string, unknown>, b: Record<string, unknown>) =>
  Object.entries(b).every(([k, v]) => JSON.stringify(a[k]) === JSON.stringify(v));

const sameKit = (db: Map<string, number>, want: Map<string, number>) =>
  db.size === want.size && [...want].every(([id, q]) => Math.abs((db.get(id) ?? NaN) - q) < 1e-9);

/**
 * `pieceIds`: SKU → id para las piezas que ya existen (las nuevas se resuelven al aplicar; en el
 * plan, una variante con piezas nuevas cuenta como cambio de kit).
 */
export function planCorreas(
  wanted: CorreaWanted,
  db: {
    pieces: DbPiece[];
    products: DbCorreaProduct[];
    categoryId: string | null;
    /** SKU de variante → handle del producto, de TODA la tienda. */
    skuOwners: Map<string, string>;
  },
): CorreaPlan {
  const errors: string[] = [];
  if (!db.categoryId) {
    errors.push(
      `No existe la categoría «${wanted.category}» (ajustes.csv). Créala antes con catalog:import.`,
    );
  }
  const pieceBySku = new Map(db.pieces.map((p) => [p.sku, p]));
  const pieces = {
    create: wanted.pieces.filter((p) => !pieceBySku.has(p.sku)),
    rename: wanted.pieces.flatMap((p) => {
      const cur = pieceBySku.get(p.sku);
      return cur && cur.title !== p.title ? [{ db: cur, title: p.title }] : [];
    }),
  };
  for (const p of wanted.pieces) {
    const cur = pieceBySku.get(p.sku);
    if (cur && (cur.unit ?? null) !== p.unit) {
      errors.push(
        `La pieza ${p.sku} ya existe con unidad «${cur.unit ?? "ud"}» (esperada «${p.unit ?? "ud"}»).`,
      );
    }
  }
  const pieceId = (sku: string) => pieceBySku.get(sku)?.id ?? `nueva:${sku}`;

  const byHandle = new Map(db.products.map((p) => [p.handle, p]));
  const create: ProductWanted[] = [];
  const update: ProductChange[] = [];
  let unchanged = 0;
  for (const want of wanted.products) {
    for (const v of want.variants) {
      const owner = db.skuOwners.get(v.sku);
      if (owner && owner !== want.handle) {
        errors.push(`El SKU ${v.sku} ya es de otro producto (${owner}).`);
      }
    }
    const cur = byHandle.get(want.handle);
    if (!cur) {
      create.push(want);
      continue;
    }
    const changes: string[] = [];
    if (cur.title !== want.title) changes.push("título");
    if ((cur.description ?? null) !== want.description) changes.push("descripción");
    if ((cur.material ?? null) !== want.material) changes.push("material");
    if (cur.status !== want.status) changes.push("estado");
    if (!sameJson(cur.metadata, want.metadata)) changes.push("metadata");
    if (db.categoryId && !cur.categoryIds.includes(db.categoryId)) changes.push("categoría");

    const missingOptions = want.options
      .filter((o) => !cur.options.has(o.title))
      .map((o) => o.title);
    if (missingOptions.length) {
      errors.push(
        `${want.handle}: le faltan las opciones ${missingOptions.join(", ")} (¿creado a mano?).`,
      );
    }
    const addValues = want.options.flatMap((o) => {
      const opt = cur.options.get(o.title);
      if (!opt) return [];
      const missing = o.values.filter((v) => !opt.values.includes(v));
      return missing.length ? [{ optionId: opt.id, title: o.title, values: missing }] : [];
    });

    const dbBySku = new Map(cur.variants.map((v) => [v.sku, v]));
    const wantSkus = new Set(want.variants.map((v) => v.sku));
    const vCreate: VariantWanted[] = [];
    const vUpdate: VariantChange[] = [];
    for (const v of want.variants) {
      const dv = dbBySku.get(v.sku);
      if (!dv) {
        vCreate.push(v);
        continue;
      }
      const ch: VariantChange["changes"] = [];
      if (!dv.basePrice || Math.abs(dv.basePrice.amount - v.price) > 1e-9) ch.push("precio");
      if (dv.weight !== v.weight) ch.push("peso");
      if (Object.entries(v.options).some(([t, val]) => dv.options[t] !== val)) ch.push("opciones");
      if (!sameJson(dv.metadata, v.metadata)) ch.push("metadata");
      const wantKit = new Map(v.kit.map((k) => [pieceId(k.sku), k.quantity]));
      if (!sameKit(dv.kit, wantKit)) ch.push("kit");
      if (ch.length) vUpdate.push({ db: dv, want: v, changes: ch });
    }
    const remove = cur.variants.filter((v) => !wantSkus.has(v.sku));
    if (changes.length || addValues.length || vCreate.length || vUpdate.length || remove.length) {
      update.push({
        db: cur,
        want,
        changes,
        addValues,
        missingOptions,
        create: vCreate,
        update: vUpdate,
        remove,
      });
    } else unchanged += 1;
  }
  return { pieces, products: { create, update, unchanged }, errors };
}
