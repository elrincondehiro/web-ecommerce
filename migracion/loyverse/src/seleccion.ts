/**
 * Paso 3: de la hoja revisada (`datos/revision/revision.csv`) a `datos/seleccion.csv`, solo con
 * las variantes marcadas «sí» en `decision`, y con `categoria_nueva` / `nombre_nuevo` aplicados.
 * Es la entrada de la fase siguiente (pasar a las plantillas de `catalog:import`).
 *
 *   pnpm --filter migracion-loyverse seleccion                       # desde revision.csv
 *   pnpm --filter migracion-loyverse seleccion <hoja.csv> [<hoja.csv>…]  # solo esas hojas
 *   pnpm --filter migracion-loyverse seleccion --volcar <hoja.csv>…      # pasa sus decisiones a revision.csv
 *
 * Con hojas sueltas (p. ej. las de `por-categoria/` ya revisadas) se genera la selección solo con
 * ellas. `--volcar` copia `decision`, `categoria_nueva`, `nombre_nuevo` y `notas` de esas hojas a
 * `revision.csv` (por `variant_id`, con copia previa en `revision/copias/`): así no se pierden
 * al regenerar la hoja (`analizar` vuelve a escribir `por-categoria/`).
 *
 * Valores de `decision`: sí/si/s/x/1 = entra · no/n/0 = fuera · vacío = sin revisar.
 */
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { EDITABLE, REVIEW_COLUMNS } from "./analisis.ts";
import { parseCsv, toCsv } from "./csv.ts";
import { DATA, OUT, exists } from "./files.ts";

// eslint-disable-next-line no-console -- script de terminal
const log = (msg: string) => console.log(msg);

export type Decision = "sí" | "no" | "";

export function normalizeDecision(raw: string | undefined): Decision | null {
  const v = (raw ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (v === "") return "";
  if (["si", "s", "x", "1", "y", "yes"].includes(v)) return "sí";
  if (["no", "n", "0"].includes(v)) return "no";
  return null;
}

export const SELECTION_COLUMNS = [
  "categoria",
  "articulo",
  "variante",
  "opciones",
  "sku",
  "codigo_barras",
  "precio",
  "coste",
  "stock",
  "proveedor",
  "iva",
  "por_peso",
  "grupo_sugerido",
  "categoria_loyverse",
  "articulo_loyverse",
  "notas",
  "item_id",
  "variant_id",
] as const;

export function select(rows: Record<string, string>[]) {
  const selected: Record<string, string>[] = [];
  const invalid: { line: number; value: string }[] = [];
  let pending = 0;
  let rejected = 0;
  rows.forEach((r, i) => {
    const d = normalizeDecision(r.decision);
    if (d === null) invalid.push({ line: i + 2, value: r.decision ?? "" });
    else if (d === "") pending++;
    else if (d === "no") rejected++;
    else {
      selected.push({
        ...r,
        categoria: r.categoria_nueva?.trim() || r.categoria || "",
        articulo: r.nombre_nuevo?.trim() || r.articulo || "",
        categoria_loyverse: r.categoria ?? "",
        articulo_loyverse: r.articulo ?? "",
      });
    }
  });
  return { selected, pending, rejected, invalid };
}

/** Lee una hoja de revisión y comprueba las columnas. */
async function readSheet(path: string) {
  const name = basename(path);
  if (!exists(path)) throw new Error(`No existe ${path}`);
  const { columns, rows } = parseCsv(await readFile(path, "utf8"));
  const missing = ["decision", "variant_id"].filter((c) => !columns.includes(c));
  if (missing.length) throw new Error(`Faltan columnas en ${name}: ${missing.join(", ")}`);
  const extra = columns.filter((c) => !(REVIEW_COLUMNS as readonly string[]).includes(c));
  if (extra.length) log(`Aviso (${name}): columnas añadidas que no se usan: ${extra.join(", ")}`);
  return { name, rows };
}

/**
 * Pasa las decisiones y correcciones de unas hojas a otra (por `variant_id`). Solo copia lo que
 * tiene valor: una celda vacía no borra lo que ya había. Devuelve cuántas filas cambiaron y los
 * `variant_id` que no están en el destino.
 */
export function mergeInto(target: Record<string, string>[], sources: Record<string, string>[]) {
  const byId = new Map(target.map((r) => [r.variant_id, r]));
  let changed = 0;
  const unknown: string[] = [];
  for (const src of sources) {
    const row = src.variant_id ? byId.get(src.variant_id) : undefined;
    if (!row) {
      if (src.variant_id) unknown.push(src.variant_id);
      continue;
    }
    let touched = false;
    for (const col of EDITABLE) {
      const v = src[col]?.trim();
      if (v && row[col] !== v) {
        row[col] = v;
        touched = true;
      }
    }
    if (touched) changed++;
  }
  return { changed, unknown };
}

async function main() {
  const args = process.argv.slice(2);
  const dump = args.includes("--volcar");
  // pnpm ejecuta el script en migracion/loyverse; INIT_CWD = carpeta desde la que se llamó.
  const base = process.env.INIT_CWD ?? process.cwd();
  const files = args.filter((a) => !a.startsWith("--")).map((a) => resolve(base, a));
  const reviewPath = join(OUT, "revision.csv");
  if (dump && !files.length) throw new Error("Uso: seleccion --volcar <hoja.csv> [<hoja.csv>…]");
  if (!files.length && !exists(reviewPath)) {
    throw new Error("No hay hoja de revisión: ejecuta antes `analizar`.");
  }

  const sheets = files.length
    ? await Promise.all(files.map(readSheet))
    : [await readSheet(reviewPath)];
  let bad = 0;
  for (const sheet of sheets) {
    const { invalid } = select(sheet.rows);
    for (const e of invalid.slice(0, 20))
      log(`${sheet.name}:${e.line} decision «${e.value}» no válida`);
    bad += invalid.length;
  }
  if (bad) throw new Error(`${bad} valores no válidos en «decision» (sí / no / vacío).`);

  if (dump) {
    const review = await readSheet(reviewPath);
    const { changed, unknown } = mergeInto(
      review.rows,
      sheets.flatMap((s) => s.rows),
    );
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    await mkdir(join(OUT, "copias"), { recursive: true });
    await copyFile(reviewPath, join(OUT, "copias", `revision-${stamp}.csv`));
    await writeFile(reviewPath, toCsv(REVIEW_COLUMNS, review.rows));
    log(`revision.csv: ${changed} filas actualizadas desde ${sheets.length} hojas`);
    if (unknown.length)
      log(`Aviso: ${unknown.length} variantes de esas hojas no están en revision.csv`);
    return;
  }

  // Varias hojas: una variante repetida cuenta una vez (gana la última hoja).
  const rows = [...new Map(sheets.flatMap((s) => s.rows).map((r) => [r.variant_id, r])).values()];
  const { selected, pending, rejected } = select(rows);
  await writeFile(join(DATA, "seleccion.csv"), toCsv(SELECTION_COLUMNS, selected));
  log(`Hojas: ${sheets.map((s) => s.name).join(", ")}`);
  log(`Seleccionadas: ${selected.length} · descartadas: ${rejected} · sin revisar: ${pending}`);
  log("→ migracion/loyverse/datos/seleccion.csv");
}

if (import.meta.main) {
  main().catch((err: unknown) => {
    log(`Error: ${(err as Error).message}`);
    process.exitCode = 1;
  });
}
