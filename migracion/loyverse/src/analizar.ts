/**
 * Paso 2: de `datos/bruto/` a la hoja de revisión y los resúmenes, en `datos/revision/`:
 *
 *   pnpm --filter migracion-loyverse analizar
 *
 * - `revision.csv`: una fila por variante (vivas primero, por categoría y nombre). Columna
 *   `decision` (sí / no / vacía) para rellenar a mano; `sugerencia` + `motivo` automáticos.
 *   Si ya existe, se CONSERVA lo escrito en `decision`, `categoria_nueva`, `nombre_nuevo` y
 *   `notas` (por `variant_id`): se puede volver a descargar y analizar sin perder la revisión.
 * - `por-categoria/<categoría>.csv`: la misma hoja partida por categoría (solo lectura: la que
 *   cuenta para `seleccion` es `revision.csv`).
 * - `resumen-categorias.csv`, `ventas-diarias.csv`, `ventas-mensuales.csv`.
 * Sin red: solo lee lo descargado.
 */
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CATEGORY_COLUMNS,
  DAILY_COLUMNS,
  MONTHLY_COLUMNS,
  REVIEW_COLUMNS,
  buildReview,
  categorySummary,
  dailySales,
  indexSales,
  mergeEdits,
  monthlySales,
  type Catalog,
  type SaleReceipt,
} from "./analisis.ts";
import { parseCsv, toCsv, type Row } from "./csv.ts";
import { OUT, RAW, RECEIPTS, exists, readJson, readJsonl, receiptMonths } from "./files.ts";

// eslint-disable-next-line no-console -- script de terminal
const log = (msg: string) => console.log(msg);

/** Nombre de fichero seguro para una categoría. */
export const fileName = (name: string) =>
  (name || "sin-categoria")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "sin-categoria";

async function main() {
  if (!exists(join(RAW, "articulos.json"))) {
    throw new Error("No hay datos: ejecuta antes `descargar`.");
  }
  const meta = await readJson<{ store_id: string }>(join(RAW, "descarga.json"));
  const catalog: Catalog = {
    items: await readJson(join(RAW, "articulos.json")),
    categories: await readJson(join(RAW, "categorias.json")),
    suppliers: await readJson(join(RAW, "proveedores.json")),
    taxes: await readJson(join(RAW, "impuestos.json")),
    inventory: await readJson(join(RAW, "stock.json")),
    storeId: meta.store_id,
  };
  const receipts: SaleReceipt[] = [];
  for (const f of await receiptMonths()) {
    receipts.push(...(await readJsonl<SaleReceipt>(join(RECEIPTS, f))));
  }
  const now = new Date();
  const known = new Set(catalog.items.flatMap((i) => i.variants.map((v) => v.variant_id)));
  const sales = indexSales(receipts, known, now);
  const rows = buildReview(catalog, sales, now);

  await mkdir(OUT, { recursive: true });
  const reviewPath = join(OUT, "revision.csv");
  const byCatDir = join(OUT, "por-categoria");
  await mkdir(byCatDir, { recursive: true });
  // 1) Lo ya revisado: revision.csv y, encima, las hojas de por-categoria/ (también las copias
  //    renombradas por el usuario, p. ej. `01-pienso.csv`). Una celda vacía no borra nada.
  let kept = 0;
  if (exists(reviewPath)) {
    kept = mergeEdits(rows, parseCsv(await readFile(reviewPath, "utf8")).rows);
    // Copia de la hoja anterior (por si se edita a la vez en VisiData o LibreOffice).
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    await mkdir(join(OUT, "copias"), { recursive: true });
    await copyFile(reviewPath, join(OUT, "copias", `revision-${stamp}.csv`));
  }
  const sheets = (await readdir(byCatDir)).filter((f) => f.endsWith(".csv"));
  let fromSheets = 0;
  for (const f of sheets) {
    fromSheets += mergeEdits(rows, parseCsv(await readFile(join(byCatDir, f), "utf8")).rows);
  }
  await writeFile(reviewPath, toCsv(REVIEW_COLUMNS, rows as Row[]));

  // 2) Se regeneran solo los ficheros de categoría que escribe este script; los demás (copias
  //    renombradas por el usuario) se quedan como están.
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    if (r.borrado === "sí") continue;
    const key = fileName(String(r.categoria));
    groups.set(key, [...(groups.get(key) ?? []), r as Row]);
  }
  for (const f of sheets) {
    if (groups.has(f.replace(/\.csv$/, ""))) await rm(join(byCatDir, f));
  }
  for (const [key, list] of groups) {
    await writeFile(join(byCatDir, `${key}.csv`), toCsv(REVIEW_COLUMNS, list));
  }

  await writeFile(
    join(OUT, "resumen-categorias.csv"),
    toCsv(CATEGORY_COLUMNS, categorySummary(rows) as Row[]),
  );
  await writeFile(join(OUT, "ventas-diarias.csv"), toCsv(DAILY_COLUMNS, dailySales(receipts)));
  const names = new Map(
    rows.map((r) => [
      String(r.variant_id),
      {
        categoria: String(r.categoria),
        articulo: String(r.articulo),
        variante: String(r.variante),
        item_id: String(r.item_id),
      },
    ]),
  );
  await writeFile(
    join(OUT, "ventas-mensuales.csv"),
    toCsv(MONTHLY_COLUMNS, monthlySales(receipts, names) as Row[]),
  );

  const live = rows.filter((r) => r.borrado !== "sí");
  const count = (s: string) => live.filter((r) => r.sugerencia === s).length;
  const items = new Set(live.map((r) => r.item_id)).size;
  log(
    `Artículos vivos: ${items} (${live.length} variantes; ${rows.length - live.length} borradas)`,
  );
  log(`Sugerencia: sí ${count("sí")} · revisar ${count("revisar")} · no ${count("no")}`);
  log(`Con problemas: ${live.filter((r) => r.problemas).length}`);
  log(`Posibles variantes (grupo_sugerido): ${live.filter((r) => r.grupo_sugerido).length}`);
  log(
    `Tickets: ${sales.receipts} (${sales.first?.slice(0, 10) ?? "—"} → ${sales.last?.slice(0, 10) ?? "—"}); líneas sin variante del catálogo: ${sales.orphanLines}`,
  );
  if (kept) log(`Revisión conservada en ${kept} filas.`);
  if (fromSheets) log(`Decisiones recogidas de por-categoria/: ${fromSheets} filas.`);
  log(`Hoja: migracion/loyverse/datos/revision/revision.csv (${groups.size} categorías)`);
}

if (import.meta.main) {
  main().catch((err: unknown) => {
    log(`Error: ${(err as Error).message}`);
    process.exitCode = 1;
  });
}
