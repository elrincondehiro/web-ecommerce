import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { decodeUtf8, isCommentCell, parseCsv } from "./csv";

/**
 * Plantillas del catálogo (`catalog/plantilla/<caso>/productos.csv`) JUNTAS en una sola hoja
 * (para los tests: un solo `productos.csv` admite todos los casos). Las columnas son la unión de
 * las de cada hoja, en el orden en que aparecen; los comentarios se quitan. Sin `descatalogado/`
 * (es una hoja de cambios que se carga después: lo prueba catalogo.spec.ts aparte).
 */
export const TEMPLATE_DIR = path.join(__dirname, "../../../catalog/plantilla");

const quote = (v: string) => (/[",\n\r;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function templateProductsCsv(root = TEMPLATE_DIR, skip = ["descatalogado"]): string {
  const sheets = readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !skip.includes(e.name))
    .map((e) => path.join(root, e.name, "productos.csv"))
    .filter((f) => existsSync(f))
    .sort()
    .map((f) => {
      const rows = parseCsv(decodeUtf8(readFileSync(f))).rows.filter(
        (r) => !isCommentCell(r.cells[0]),
      );
      const [head, ...body] = rows.map((r) => r.cells);
      return { head: head!, body };
    });
  const columns: string[] = [];
  for (const s of sheets) for (const c of s.head) if (!columns.includes(c)) columns.push(c);
  const lines = [columns.join(",")];
  for (const s of sheets) {
    for (const row of s.body) {
      const byName = new Map(s.head.map((c, i) => [c, row[i] ?? ""]));
      lines.push(columns.map((c) => quote(byName.get(c) ?? "")).join(","));
    }
  }
  return `${lines.join("\n")}\n`;
}
