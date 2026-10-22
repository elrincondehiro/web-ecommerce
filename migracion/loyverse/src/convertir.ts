/**
 * Fase W: de las hojas revisadas a `datos/medusa/` para `catalog:import` del backend.
 *
 *   pnpm --filter migracion-loyverse convertir                 # todo lo marcado «sí» en revision.csv
 *   pnpm --filter migracion-loyverse convertir <hoja.csv>…     # solo esas hojas (cargas por categoría)
 *
 * Escribe en `datos/medusa/`:
 *   - `productos.csv`: hoja para `catalog:import` (stock 0, publicado).
 *   - `categorias.csv`: copia del árbol nuevo (`apps/backend/catalog/mi-carga/categorias.csv`).
 *   - `avisos.csv`: lo que conviene revisar antes de cargar.
 * Y mantiene (se crean la primera vez con una propuesta; NUNCA se sobrescribe lo que pongas):
 *   - `mapa-categorias.csv`: categoría de Loyverse → handle(s) del árbol nuevo (`a|b`).
 *   - `mapa-opciones.csv`: opción de Loyverse → opción de la tienda.
 *   - `handles.csv`: handle de cada producto (corrígelo aquí; se respeta en las siguientes).
 * Si falta una opción o una categoría en los mapas, se añade con la propuesta y se para: revisa el
 * mapa y vuelve a ejecutarlo.
 *
 * Después:
 *   pnpm --filter backend catalog:import ../../migracion/loyverse/datos/medusa dry-run
 */
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseCsv, toCsv } from "./csv.ts";
import { DATA, OUT, RAW, ROOT, exists, readJson } from "./files.ts";
import {
  DEFAULT_OPTIONS,
  convert,
  fold,
  proposeCategory,
  type CategoryMap,
  type OptionMap,
} from "./medusa.ts";
import { normalizeDecision } from "./seleccion.ts";
import type { Item } from "./types.ts";

// eslint-disable-next-line no-console -- script de terminal
const log = (msg: string) => console.log(msg);

const MEDUSA = join(DATA, "medusa");
const TREE = join(ROOT, "..", "..", "apps", "backend", "catalog", "mi-carga", "categorias.csv");

async function readTable(path: string) {
  return exists(path) ? parseCsv(await readFile(path, "utf8"), { comments: true }).rows : [];
}

async function main() {
  const base = process.env.INIT_CWD ?? process.cwd();
  const files = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const sheets = files.length ? files.map((f) => resolve(base, f)) : [join(OUT, "revision.csv")];
  for (const f of sheets) if (!exists(f)) throw new Error(`No existe ${f}`);
  if (!exists(TREE)) throw new Error(`No existe el árbol de categorías: ${TREE}`);

  // Filas marcadas «sí» (una variante repetida en varias hojas cuenta una vez).
  const byVariant = new Map<string, Record<string, string>>();
  for (const f of sheets) {
    for (const r of parseCsv(await readFile(f, "utf8")).rows) {
      if (normalizeDecision(r.decision) === "sí" && r.variant_id) {
        byVariant.set(r.variant_id, {
          ...r,
          categoria_loyverse: r.categoria ?? "",
          articulo_loyverse: r.articulo ?? "",
        });
      }
    }
  }
  const selected = [...byVariant.values()];
  if (!selected.length) throw new Error("No hay ninguna fila marcada «sí» en esas hojas.");

  const items = new Map(
    (await readJson<Item[]>(join(RAW, "articulos.json"))).map((i) => [i.id, i]),
  );
  const tree = (await readTable(TREE))
    .filter((c) => c.handle)
    .map((c) => ({ handle: c.handle!, nombre: c.nombre ?? "", padre: c.padre ?? "" }));
  const treeHandles = new Set(tree.map((c) => c.handle));
  await mkdir(MEDUSA, { recursive: true });

  // Mapas (se conservan; solo se añaden las entradas que faltan, con la propuesta).
  const optPath = join(MEDUSA, "mapa-opciones.csv");
  const catPath = join(MEDUSA, "mapa-categorias.csv");
  const handlesPath = join(MEDUSA, "handles.csv");
  const optRows = await readTable(optPath);
  const catRows = await readTable(catPath);
  const options: OptionMap = new Map(
    optRows.filter((r) => r.tienda?.trim()).map((r) => [fold(r.loyverse ?? ""), r.tienda!.trim()]),
  );
  const categories: CategoryMap = new Map(
    catRows.filter((r) => r.handle?.trim()).map((r) => [fold(r.loyverse ?? ""), r.handle!.trim()]),
  );
  const handles = new Map(
    (await readTable(handlesPath))
      .filter((r) => r.handle?.trim())
      .map((r) => [r.clave!, r.handle!.trim()]),
  );

  const result = convert(selected, items, { options, categories, handles });

  // Entradas nuevas de los mapas → se escriben con la propuesta y se para.
  let stop = false;
  if (result.unmappedOptions.length) {
    const known = new Set(optRows.map((r) => fold(r.loyverse ?? "")));
    for (const o of result.unmappedOptions) {
      if (known.has(fold(o))) continue;
      known.add(fold(o));
      optRows.push({ loyverse: o, tienda: DEFAULT_OPTIONS[fold(o)] ?? "" });
    }
    await writeFile(optPath, toCsv(["loyverse", "tienda"], optRows));
    log(`mapa-opciones.csv: revisa estas opciones (${result.unmappedOptions.join(", ")})`);
    stop = true;
  }
  if (result.unmappedCategories.length) {
    const known = new Set(catRows.map((r) => fold(r.loyverse ?? "")));
    for (const c of result.unmappedCategories) {
      if (known.has(fold(c))) continue;
      known.add(fold(c));
      catRows.push({ loyverse: c, handle: proposeCategory(c, tree) });
    }
    await writeFile(catPath, toCsv(["loyverse", "handle"], catRows));
    log(`mapa-categorias.csv: revisa estas categorías (${result.unmappedCategories.join(", ")})`);
    stop = true;
  }
  // Categorías del mapa que no existen en el árbol nuevo.
  const badCats = [
    ...new Set(result.rows.flatMap((r) => (r.categorias ?? "").split("|")).filter(Boolean)),
  ].filter((h) => !treeHandles.has(h));
  if (badCats.length) {
    log(`Categorías que no están en mi-carga/categorias.csv: ${badCats.join(", ")}`);
    stop = true;
  }
  if (stop) {
    log("Corrige los mapas (columna «tienda» / «handle») en datos/medusa/ y vuelve a ejecutar.");
    process.exitCode = 1;
    return;
  }

  // handles.csv: todos los conocidos (también de otras cargas), con los de esta actualizados.
  const allHandles = new Map((await readTable(handlesPath)).map((r) => [r.clave!, r]));
  for (const h of result.handles) {
    allHandles.set(h.clave, { clave: h.clave, titulo: h.titulo, handle: h.handle });
  }
  await writeFile(handlesPath, toCsv(["clave", "titulo", "handle"], [...allHandles.values()]));
  await writeFile(join(MEDUSA, "productos.csv"), toCsv(result.columns, result.rows));
  await copyFile(TREE, join(MEDUSA, "categorias.csv"));
  await writeFile(
    join(MEDUSA, "avisos.csv"),
    toCsv(
      ["handle", "articulo", "sku", "aviso"],
      result.warnings.map((w) => ({ ...w })),
    ),
  );

  const products = new Set(result.rows.map((r) => r.handle)).size;
  log(
    `Productos: ${products} (${result.rows.length} variantes) · avisos: ${result.warnings.length}`,
  );
  log("→ migracion/loyverse/datos/medusa/ (productos.csv, categorias.csv, avisos.csv)");
  log(
    "Siguiente: pnpm --filter backend catalog:import ../../migracion/loyverse/datos/medusa dry-run",
  );
}

if (import.meta.main) {
  main().catch((err: unknown) => {
    log(`Error: ${(err as Error).message}`);
    process.exitCode = 1;
  });
}
