/**
 * Lector CSV mínimo (RFC 4180) para el importador de catálogo, sin dependencias.
 *   - Separador `,` o `;` (Excel en español guarda con `;`): se elige el que más aparece en la
 *     cabecera fuera de comillas.
 *   - Comillas dobles con `""` como escape y saltos de línea dentro de comillas.
 *   - Quita el BOM y admite `\r\n`.
 *   - Filas de comentario: las que empiezan por `#` (o `"#`) se ignoran, también antes de la
 *     cabecera (las plantillas llevan ahí las instrucciones).
 * Funciones puras (sin I/O) para poder testearlas.
 */

export interface CsvTable {
  delimiter: "," | ";";
  /** Filas con su número de línea en el fichero (1 = cabecera), para los informes. */
  rows: { line: number; cells: string[] }[];
}

/** Decodifica UTF-8 estricto: si el fichero no es UTF-8 (p. ej. «CSV» de Excel en ANSI), falla. */
export function decodeUtf8(buffer: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new Error(
      "El fichero no está en UTF-8. En Excel: Guardar como → «CSV UTF-8 (delimitado por comas)».",
    );
  }
}

export const isCommentCell = (cell: string | undefined) => (cell ?? "").trimStart().startsWith("#");

/** Separador según la primera línea que no es comentario (la cabecera). */
function detectDelimiter(text: string): "," | ";" {
  const header = text.split(/\r?\n/).find((l) => l.trim() && !/^\s*"?#/.test(l)) ?? "";
  let commas = 0;
  let semicolons = 0;
  let quoted = false;
  for (const ch of header) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === "\n" || ch === "\r")) break;
    else if (!quoted && ch === ",") commas += 1;
    else if (!quoted && ch === ";") semicolons += 1;
  }
  return semicolons > commas ? ";" : ",";
}

export function parseCsv(input: string): CsvTable {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const delimiter = detectDelimiter(text);
  const rows: CsvTable["rows"] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let rowLine = 1;

  const endCell = () => {
    cells.push(cell);
    cell = "";
  };
  const endRow = () => {
    endCell();
    if (!isCommentCell(cells[0])) rows.push({ line: rowLine, cells });
    cells = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] as string;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        if (ch === "\n") line += 1;
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell === "") {
      quoted = true;
    } else if (ch === delimiter) {
      endCell();
    } else if (ch === "\r" && text[i + 1] === "\n") {
      // se trata en el \n
    } else if (ch === "\n" || ch === "\r") {
      endRow();
      line += 1;
      rowLine = line;
    } else {
      cell += ch;
    }
  }
  if (quoted) throw new Error(`Comillas sin cerrar (desde la línea ${rowLine}).`);
  if (cell !== "" || cells.length) endRow();
  return { delimiter, rows };
}
