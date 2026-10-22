/**
 * CSV mínimo (RFC 4180) sin dependencias: escribir las hojas de revisión y leerlas de vuelta
 * después de editarlas (LibreOffice guarda con `,` o `;`; VisiData con `,`). Como el lector del
 * importador de catálogo (apps/backend/src/scripts/lib/csv.ts), sin comentarios `#`.
 */

export type Row = Record<string, string | number | boolean | null | undefined>;

const needsQuotes = /[",;\r\n]|^\s|\s$/;

export function cell(value: Row[string]): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "number" ? formatNumber(value) : String(value);
  return needsQuotes.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Números con punto decimal y sin ceros de más (LibreOffice/VisiData los leen como número). */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "";
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000);
}

export function toCsv(columns: readonly string[], rows: Row[]): string {
  const lines = [columns.map((c) => cell(c)).join(",")];
  for (const row of rows) lines.push(columns.map((c) => cell(row[c])).join(","));
  return `${lines.join("\n")}\n`;
}

function detectDelimiter(text: string, comments = false): "," | ";" {
  if (comments) {
    const header = text.split(/\r?\n/).find((l) => l.trim() && !/^\s*"?#/.test(l)) ?? "";
    text = header;
  }
  let commas = 0;
  let semicolons = 0;
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === "\n" || ch === "\r")) break;
    else if (!quoted && ch === ",") commas += 1;
    else if (!quoted && ch === ";") semicolons += 1;
  }
  return semicolons > commas ? ";" : ",";
}

/**
 * Filas como objetos por cabecera (sin BOM; filas vacías fuera). `comments`: ignora las filas que
 * empiezan por `#` (las plantillas de `catalog:import` llevan ahí las instrucciones).
 */
export function parseCsv(
  input: string,
  { comments = false }: { comments?: boolean } = {},
): { columns: string[]; rows: Record<string, string>[] } {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const delimiter = detectDelimiter(text, comments);
  const table: string[][] = [];
  let cells: string[] = [];
  let value = "";
  let quoted = false;
  const endCell = () => {
    cells.push(value);
    value = "";
  };
  const endRow = () => {
    endCell();
    const isComment = comments && (cells[0] ?? "").trimStart().startsWith("#");
    if (!isComment && cells.some((c) => c.trim() !== "")) table.push(cells);
    cells = [];
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] as string;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i += 1;
        } else quoted = false;
      } else value += ch;
      continue;
    }
    if (ch === '"' && value === "") quoted = true;
    else if (ch === delimiter) endCell();
    else if (ch === "\r" && text[i + 1] === "\n") continue;
    else if (ch === "\n" || ch === "\r") endRow();
    else value += ch;
  }
  if (quoted) throw new Error("CSV: comillas sin cerrar.");
  if (value !== "" || cells.length) endRow();
  const [header = [], ...body] = table;
  const columns = header.map((h) => h.trim());
  const rows = body.map((cellsOfRow) =>
    Object.fromEntries(columns.map((c, i) => [c, cellsOfRow[i] ?? ""])),
  );
  return { columns, rows };
}
