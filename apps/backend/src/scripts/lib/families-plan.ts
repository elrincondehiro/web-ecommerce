/**
 * Plan de `familias.csv` contra Medusa (Fase FO-2). Funciones puras: reciben la hoja leída
 * (families-sheet.ts) y las opciones globales con su metadata, y devuelven qué escribir.
 *
 * Medusa FUSIONA la metadata al actualizar (`mergeMetadata` en el servicio interno,
 * @medusajs/utils 2.22.1 modules-sdk/medusa-internal-service.js): las claves que no se envían se
 * conservan y una clave solo se BORRA si se envía como `""`. El plan parte de la actual (para
 * comparar e informar) y, para quitar `familias` o `color`, los manda como `""`. Solo devuelve lo
 * que cambia (idempotente). Comprobado con el test HTTP familias.spec.ts.
 */
import {
  FAMILIES_KEY,
  optionFamilies,
  valueFamilies,
  valuesWithoutFamily,
  type OptionFamily,
} from "../../lib/option-families";
import type { SheetIssue } from "./catalog-sheet";
import { findByFold } from "./catalog-plan";
import { FAMILIES_FILE, type FamiliesSheet } from "./families-sheet";

/** Clave del color de la muestra en el valor (Fase O; lib/variant-picker.ts VALUE_COLOR_KEY). */
export const SWATCH_KEY = "color";

type Metadata = Record<string, unknown>;

export interface DbFamilyOption {
  id: string;
  title: string;
  metadata: Metadata | null;
  values: { id: string; value: string; metadata: Metadata | null }[];
}

/**
 * Opciones y valores que `productos.csv` va a crear en esta misma carga (plan del catálogo): en
 * un dry-run aún no están en Medusa. Se añaden al snapshot con id `pendiente:` para validar la
 * hoja; al escribir de verdad, el plan se calcula otra vez tras crear los productos.
 */
export function withPendingOptions(
  db: DbFamilyOption[],
  pending: {
    create: { title: string; values: string[] }[];
    addValues: { id: string; values: string[] }[];
  },
): DbFamilyOption[] {
  const out = db.map((o) => ({ ...o, values: [...o.values] }));
  for (const add of pending.addValues) {
    const option = out.find((o) => o.id === add.id);
    for (const value of add.values) {
      option?.values.push({ id: `pendiente:${option.id}:${value}`, value, metadata: null });
    }
  }
  for (const created of pending.create) {
    out.push({
      id: `pendiente:${created.title}`,
      title: created.title,
      metadata: null,
      values: created.values.map((value) => ({
        id: `pendiente:${created.title}:${value}`,
        value,
        metadata: null,
      })),
    });
  }
  return out;
}

export interface FamiliesPlan {
  /** Opciones cuya lista de familias cambia: metadata completa a escribir. */
  options: { id: string; title: string; metadata: Metadata; families: OptionFamily[] }[];
  /** Valores cuya metadata cambia: metadata completa a escribir. */
  values: { id: string; option: string; value: string; metadata: Metadata; changes: string[] }[];
  errors: SheetIssue[];
  warnings: SheetIssue[];
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Valor que BORRA una clave al escribir (mergeMetadata de Medusa 2.22.1: `""` = borrar). */
export const DELETE_KEY = "";

/** Quita una clave: `""` en lo que se escribe (borrar), y fuera de lo que se compara. */
function without(meta: Metadata, key: string): Metadata {
  return { ...meta, [key]: DELETE_KEY };
}

/** Metadata tal como quedará en Medusa (sin las claves que se borran). */
export const effectiveMetadata = (meta: Metadata): Metadata =>
  Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== DELETE_KEY));

export function planFamilies(sheet: FamiliesSheet, db: DbFamilyOption[]): FamiliesPlan {
  const plan: FamiliesPlan = { options: [], values: [], errors: [], warnings: [] };
  const e = (line: number, column: string, message: string) =>
    plan.errors.push({ file: FAMILIES_FILE, line, column, message });

  // Familias vigentes por opción tras la hoja (las de la hoja sustituyen a las de Medusa)
  const finalFamilies = new Map<string, OptionFamily[]>();
  const optionMeta = new Map<string, Metadata>();
  for (const o of db) {
    finalFamilies.set(o.id, optionFamilies(o.metadata));
    optionMeta.set(o.id, { ...(o.metadata ?? {}) });
  }
  for (const def of sheet.definitions) {
    const option = findByFold(db, (o) => o.title, def.option);
    if (!option) {
      e(
        def.line,
        "opcion",
        `No existe la opción «${def.option}» (las opciones las crea productos.csv).`,
      );
      continue;
    }
    finalFamilies.set(option.id, def.families);
    const current = optionFamilies(option.metadata);
    if (!same(current, def.families)) {
      const metadata = def.families.length
        ? { ...(option.metadata ?? {}), [FAMILIES_KEY]: def.families }
        : without(option.metadata ?? {}, FAMILIES_KEY);
      plan.options.push({ id: option.id, title: option.title, metadata, families: def.families });
      optionMeta.set(option.id, effectiveMetadata(metadata));
    }
  }

  // Asignaciones de valores
  const valueMeta = new Map<string, Metadata>();
  for (const a of sheet.assignments) {
    const option = findByFold(db, (o) => o.title, a.option);
    if (!option) {
      e(a.line, "opcion", `No existe la opción «${a.option}».`);
      continue;
    }
    const value = findByFold(option.values, (v) => v.value, a.value);
    if (!value) {
      e(a.line, "valor", `La opción «${option.title}» no tiene el valor «${a.value}».`);
      continue;
    }
    const families = finalFamilies.get(option.id) ?? [];
    const changes: string[] = [];
    let meta: Metadata = { ...(value.metadata ?? {}) };
    if (a.families !== null) {
      if (a.families.length && !families.length) {
        e(a.line, "familias", `La opción «${option.title}» no tiene familias definidas.`);
        continue;
      }
      const unknown = a.families.filter((f) => !families.some((x) => x.id === f));
      if (unknown.length) {
        e(
          a.line,
          "familias",
          `Familias que no existen en «${option.title}»: ${unknown.join(", ")}.`,
        );
        continue;
      }
      // En el orden de la opción (como las lee valueFamilies)
      const next = families.filter((f) => a.families!.includes(f.id)).map((f) => f.id);
      const current = valueFamilies(value.metadata, families);
      if (!same(current, next) || (next.length === 0 && FAMILIES_KEY in meta)) {
        meta = next.length ? { ...meta, [FAMILIES_KEY]: next } : without(meta, FAMILIES_KEY);
        changes.push(next.length ? `familias ${next.join("|")}` : "sin familias");
      }
    }
    if (a.swatch !== undefined) {
      const raw = meta[SWATCH_KEY];
      const current = typeof raw === "string" && raw !== DELETE_KEY ? raw : null;
      if (current !== a.swatch) {
        meta = a.swatch ? { ...meta, [SWATCH_KEY]: a.swatch } : without(meta, SWATCH_KEY);
        changes.push(a.swatch ? `color ${a.swatch}` : "sin color");
      }
    }
    if (changes.length) {
      plan.values.push({
        id: value.id,
        option: option.title,
        value: value.value,
        metadata: meta,
        changes,
      });
      valueMeta.set(value.id, effectiveMetadata(meta));
    }
  }

  // Avisos: valores sin familia en las opciones que las tienen (tras aplicar la hoja)
  for (const o of db) {
    const families = finalFamilies.get(o.id) ?? [];
    if (!families.length) continue;
    const missing = valuesWithoutFamily({
      title: o.title,
      metadata: optionMeta.get(o.id) ?? null,
      values: o.values.map((v) => ({
        value: v.value,
        metadata: valueMeta.get(v.id) ?? v.metadata,
      })),
    });
    if (missing.length) {
      plan.warnings.push({
        file: FAMILIES_FILE,
        line: 1,
        column: o.title,
        message: `${missing.length} valores sin familia (no saldrán en el filtro): ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? "…" : ""}.`,
      });
    }
  }
  // Valores que la hoja asigna pero cuyas familias quedan fuera de la nueva definición
  for (const def of sheet.definitions) {
    const option = findByFold(db, (o) => o.title, def.option);
    if (!option) continue;
    const kept = new Set(def.families.map((f) => f.id));
    for (const v of option.values) {
      const meta = valueMeta.get(v.id) ?? v.metadata;
      const raw = meta?.[FAMILIES_KEY];
      const ids = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
      const lost = ids.filter((id) => !kept.has(id));
      if (lost.length) {
        plan.warnings.push({
          file: FAMILIES_FILE,
          line: def.line,
          column: option.title,
          message: `«${v.value}» tiene familias que ya no existen (${lost.join(", ")}): se ignoran.`,
        });
      }
    }
  }
  return plan;
}
