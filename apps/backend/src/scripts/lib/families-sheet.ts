/**
 * Hoja `familias.csv` del importador (Fase FO-2): familias de las opciones globales y a cuáles
 * pertenece cada valor. Opcional, junto a `categorias.csv` y `productos.csv`; se aplica DESPUÉS
 * de los productos (los valores tienen que existir).
 *
 *   opcion,familia,nombre,color,valor,familias,color_muestra
 *   Color,plantilla,,,,,                       ← definir: las 12 de color (COLOR_FAMILIES)
 *   Talla,s,Pequeña,,,,                        ← definir: una familia (en el orden de las filas)
 *   Color,,,,Sea Foam,verde|azul,#8fd3c1       ← asignar: familias (y color de la muestra)
 *
 * Una fila DEFINE si tiene `familia`, y ASIGNA si tiene `valor` (las dos cosas a la vez es un
 * error). Celda vacía = no tocar; `-` = borrar (`familias` o `color_muestra`). Funciones puras;
 * la comparación con Medusa está en families-plan.ts.
 */
import {
  COLOR_FAMILIES,
  FAMILY_ID_RE,
  MAX_FAMILIES,
  MAX_FAMILIES_PER_VALUE,
  parseFamilyList,
  type OptionFamily,
} from "../../lib/option-families";
import type { CsvTable } from "./csv";
import { CLEAR, fold, type SheetIssue } from "./catalog-sheet";

export const FAMILIES_FILE = "familias.csv";
/** Valor de `familia` que carga las 12 familias de color de una vez. */
export const TEMPLATE_KEYWORD = "plantilla";

const COLUMNS = [
  "opcion",
  "familia",
  "nombre",
  "color",
  "valor",
  "familias",
  "color_muestra",
] as const;
type Column = (typeof COLUMNS)[number];
const HEX_RE = /^#[0-9a-f]{6}$/i;
const MAX_NAME = 40;

/** Familias de una opción según la hoja (sustituyen a las de Medusa). */
export interface FamilyDefinition {
  option: string;
  line: number;
  families: OptionFamily[];
}

/** Asignación de un valor: `families` null = no tocar, [] = quitar; ídem `swatch`. */
export interface FamilyAssignment {
  option: string;
  value: string;
  line: number;
  families: string[] | null;
  swatch: string | null | undefined;
}

export interface FamiliesSheet {
  definitions: FamilyDefinition[];
  assignments: FamilyAssignment[];
  errors: SheetIssue[];
}

export function readFamilies(table: CsvTable): FamiliesSheet {
  const errors: SheetIssue[] = [];
  const out: FamiliesSheet = { definitions: [], assignments: [], errors };
  const header = table.rows[0];
  if (!header) {
    errors.push({ file: FAMILIES_FILE, line: 1, message: "El fichero está vacío." });
    return out;
  }
  const index = new Map<Column, number>();
  header.cells.forEach((raw, i) => {
    const name = fold(raw) as Column;
    if (!name) return;
    if (!(COLUMNS as readonly string[]).includes(name)) {
      errors.push({ file: FAMILIES_FILE, line: 1, column: raw, message: "Columna desconocida." });
    } else if (index.has(name)) {
      errors.push({ file: FAMILIES_FILE, line: 1, column: raw, message: "Columna repetida." });
    } else index.set(name, i);
  });
  for (const required of ["opcion"] as const) {
    if (!index.has(required)) {
      errors.push({ file: FAMILIES_FILE, line: 1, message: `Falta la columna «${required}».` });
    }
  }
  if (errors.length) return out;

  const byOption = new Map<string, FamilyDefinition>();
  const seenValues = new Map<string, number>();

  for (const row of table.rows.slice(1)) {
    const cell = (c: Column) => {
      const i = index.get(c);
      return i === undefined ? "" : (row.cells[i] ?? "").trim();
    };
    if (COLUMNS.every((c) => !cell(c))) continue;
    const err = (column: Column, message: string) =>
      errors.push({ file: FAMILIES_FILE, line: row.line, column, message });
    const option = cell("opcion");
    if (!option) {
      err("opcion", "Falta la opción (p. ej. «Color»).");
      continue;
    }
    const familia = cell("familia");
    const valor = cell("valor");
    if (familia && valor) {
      err("familia", "Una fila define una familia O asigna un valor, no las dos cosas.");
      continue;
    }
    if (!familia && !valor) {
      err("familia", "Falta «familia» (para definirla) o «valor» (para asignarlo).");
      continue;
    }

    if (familia) {
      // Definir
      for (const c of ["familias", "color_muestra"] as const) {
        if (cell(c)) err(c, "Esta columna es de las filas que asignan un valor.");
      }
      const def = byOption.get(fold(option)) ?? { option, line: row.line, families: [] };
      byOption.set(fold(option), def);
      const add = (f: OptionFamily) => {
        if (def.families.some((x) => x.id === f.id)) {
          err("familia", `Familia «${f.id}» repetida en la opción «${option}».`);
        } else if (def.families.length >= MAX_FAMILIES) {
          err("familia", `Como mucho ${MAX_FAMILIES} familias por opción.`);
        } else def.families.push(f);
      };
      if (fold(familia) === TEMPLATE_KEYWORD) {
        if (cell("nombre") || cell("color")) {
          err("familia", "Con «plantilla» no se rellenan nombre ni color.");
        }
        for (const f of COLOR_FAMILIES) add({ ...f });
        continue;
      }
      const id = familia.toLowerCase();
      const nombre = cell("nombre");
      const color = cell("color");
      if (!FAMILY_ID_RE.test(id)) {
        err(
          "familia",
          `«${familia}» no es válido: minúsculas, números y guiones (p. ej. «azul-claro»).`,
        );
      } else if (!nombre || nombre.length > MAX_NAME) {
        err("nombre", `Falta el nombre (lo que sale en el filtro, hasta ${MAX_NAME} caracteres).`);
      } else if (color && !HEX_RE.test(color)) {
        err("color", `«${color}» no es un color #rrggbb.`);
      } else add({ id, nombre, color: color ? color.toLowerCase() : null });
      continue;
    }

    // Asignar
    for (const c of ["nombre", "color"] as const) {
      if (cell(c)) err(c, "Esta columna es de las filas que definen una familia.");
    }
    const key = `${fold(option)}\u0000${fold(valor)}`;
    if (seenValues.has(key)) {
      err("valor", `Valor repetido (ya está en la línea ${seenValues.get(key)}).`);
      continue;
    }
    seenValues.set(key, row.line);
    const rawFamilies = cell("familias");
    const rawSwatch = cell("color_muestra");
    let families: string[] | null = null;
    if (rawFamilies === CLEAR) families = [];
    else if (rawFamilies) {
      families = parseFamilyList(rawFamilies);
      const bad = families.filter((f) => !FAMILY_ID_RE.test(f));
      if (bad.length) err("familias", `Familias no válidas: ${bad.join(", ")}.`);
      if (families.length > MAX_FAMILIES_PER_VALUE) {
        err("familias", `Como mucho ${MAX_FAMILIES_PER_VALUE} familias por valor.`);
      }
    }
    let swatch: string | null | undefined;
    if (rawSwatch === CLEAR) swatch = null;
    else if (rawSwatch) {
      if (HEX_RE.test(rawSwatch)) swatch = rawSwatch.toLowerCase();
      else {
        err("color_muestra", `«${rawSwatch}» no es un color #rrggbb.`);
        continue;
      }
    }
    if (families === null && swatch === undefined) {
      err("familias", "La fila no cambia nada: rellena «familias» o «color_muestra».");
      continue;
    }
    out.assignments.push({ option, value: valor, line: row.line, families, swatch });
  }
  out.definitions = [...byOption.values()];
  return out;
}
