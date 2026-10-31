/**
 * Descripciones con formato (productos, categorías y colecciones): el Admin y la hoja del catálogo
 * guardan TEXTO plano en Medusa; aquí se convierte en HTML en el build con un subconjunto pequeño
 * de Markdown, sin dependencias y sin JS en el cliente.
 *
 *   Bloques: línea en blanco = párrafo nuevo · salto simple = <br> · `- `, `* `, `• ` (o `*Texto`
 *   / `•Texto` pegados, como en las fichas de proveedor) = lista · `1. ` / `1) ` = lista numerada
 *   · `## Título` = subtítulo · `---` = separador.
 *   En línea: **negrita** · *cursiva* o _cursiva_ · ~~tachado~~ · [texto](https://…, /ruta,
 *   mailto:, tel:).
 *
 * Seguridad: TODO el texto se escapa antes de dar formato, así que nunca pasa HTML del Admin o del
 * CSV a la página; los enlaces solo admiten esos esquemas (nada de `javascript:`). El resultado
 * es apto para `set:html` y para la CSP (sin `style` ni `on*`). Funciones puras: rich-text.test.ts.
 */

export interface RichTextOptions {
  /** Nivel de `#`/`##` (el de `###` es uno más). 3 en la ficha (va bajo un h2), 2 en listados. */
  headingLevel?: 2 | 3 | 4;
}

// Caracteres de control (salvo \t \n \r): se quitan; los usa el marcador de enlaces de abajo.
// eslint-disable-next-line no-control-regex -- buscar caracteres de control es el objetivo
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const HEADING = /^(#{1,6})\s+(.+?)\s*#*$/;
const RULE = /^(?:-{3,}|\*{3,}|_{3,})$/;
const ORDERED = /^(\d{1,3})[.)]\s+(.+)$/;

const UNESCAPE: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};
const unescapeHtml = (s: string) => s.replace(/&(?:amp|lt|gt|quot|#39);/g, (e) => UNESCAPE[e]!);

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Elemento de lista no numerada: su texto, o null si la línea no lo es. */
function bulletItem(line: string): string | null {
  const spaced = /^[-*•]\s+(.+)$/.exec(line);
  if (spaced) return spaced[1]!;
  // Pegado al texto (`*Confección…`, `•Ajuste…`). Con `*`, solo si no hay otro `*` en la línea
  // (si no, es una cursiva: `*suave* al tacto`). `-Texto` no cuenta: «-20 %».
  const glued = /^(?:•|\*(?!\*))(\S.*)$/.exec(line);
  if (glued && (line[0] === "•" || !glued[1]!.includes("*"))) return glued[1]!;
  return null;
}

/** Enlace seguro: rutas de la web, http(s), mailto: y tel:. null si no se admite. */
function safeHref(url: string): string | null {
  if (/^\/(?!\/)/.test(url) || url.startsWith("#")) return url;
  if (/^(?:https?:\/\/|mailto:|tel:)/i.test(url)) return url;
  return null;
}

function emphasis(s: string): string {
  return s
    .replace(/\*\*(?=\S)(.*?\S)\*\*/g, "<strong>$1</strong>")
    .replace(/~~(?=\S)(.*?\S)~~/g, "<s>$1</s>")
    .replace(/\*(?=\S)([^*]*?\S)\*/g, "<em>$1</em>")
    .replace(/(^|[^\p{L}\p{N}_])_(?=\S)([^_]*?\S)_(?![\p{L}\p{N}_])/gu, "$1<em>$2</em>");
}

/** Formato en línea sobre texto SIN escapar (escapa él). */
export function inlineHtml(text: string): string {
  const links: string[] = [];
  // Los enlaces se apartan antes de las cursivas (una `_` de la URL no debe abrir una).
  const withLinks = escapeHtml(text.replace(CONTROL, "")).replace(
    /\[([^\]]+)\]\(([^\s)]+)\)/g,
    (_m, label: string, url: string) => {
      const href = safeHref(unescapeHtml(url));
      if (!href) return label;
      links.push(`<a href="${escapeHtml(href)}">${emphasis(label)}</a>`);
      return `\u0001${links.length - 1}\u0002`;
    },
  );
  // eslint-disable-next-line no-control-regex -- marcador propio (el texto ya no los tiene)
  return emphasis(withLinks).replace(/\u0001(\d+)\u0002/g, (_m, i: string) => links[Number(i)]!);
}

type Block =
  | { kind: "p"; lines: string[] }
  | { kind: "ul" | "ol"; items: string[]; start: number }
  | { kind: "h"; level: number; text: string }
  | { kind: "hr" };

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let open: Block | null = null;
  const close = () => {
    if (open) blocks.push(open);
    open = null;
  };
  for (const raw of text.replace(CONTROL, "").replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      close();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      close();
      blocks.push({ kind: "h", level: heading[1]!.length, text: heading[2]! });
      continue;
    }
    if (RULE.test(line)) {
      close();
      blocks.push({ kind: "hr" });
      continue;
    }
    const bullet = bulletItem(line);
    const ordered = bullet === null ? ORDERED.exec(line) : null;
    if (bullet !== null || ordered) {
      const kind = bullet !== null ? "ul" : "ol";
      const cur = open as Block | null;
      if (cur?.kind !== kind) {
        close();
        open = { kind, items: [], start: ordered ? Number(ordered[1]) : 1 };
      }
      (open as unknown as { items: string[] }).items.push(bullet ?? ordered![2]!);
      continue;
    }
    const cur = open as Block | null;
    if (cur?.kind !== "p") {
      close();
      open = { kind: "p", lines: [] };
    }
    (open as unknown as { lines: string[] }).lines.push(line);
  }
  close();
  return blocks;
}

/** Descripción → HTML (párrafos, listas, subtítulos…). Cadena vacía si no hay texto. */
export function richTextHtml(text: string | null | undefined, options: RichTextOptions = {}) {
  const base = options.headingLevel ?? 3;
  return parseBlocks(text ?? "")
    .map((b) => {
      switch (b.kind) {
        case "p":
          return `<p>${b.lines.map(inlineHtml).join("<br>")}</p>`;
        case "ul":
        case "ol": {
          const start = b.kind === "ol" && b.start !== 1 ? ` start="${b.start}"` : "";
          const items = b.items.map((i) => `<li>${inlineHtml(i)}</li>`).join("");
          return `<${b.kind}${start}>${items}</${b.kind}>`;
        }
        case "h": {
          const level = Math.min(6, base + Math.max(0, b.level - 2));
          return `<h${level}>${inlineHtml(b.text)}</h${level}>`;
        }
        case "hr":
          return "<hr>";
      }
    })
    .join("");
}

/** Descripción sin marcas de formato (meta description, JSON-LD): un bloque por línea. */
export function richTextPlain(text: string | null | undefined): string {
  const strip = (s: string) =>
    s
      .replace(/\[([^\]]+)\]\([^\s)]+\)/g, "$1")
      .replace(/\*\*(?=\S)(.*?\S)\*\*/g, "$1")
      .replace(/~~(?=\S)(.*?\S)~~/g, "$1")
      .replace(/\*(?=\S)([^*]*?\S)\*/g, "$1")
      .replace(/(^|[^\p{L}\p{N}_])_(?=\S)([^_]*?\S)_(?![\p{L}\p{N}_])/gu, "$1$2");
  return parseBlocks(text ?? "")
    .flatMap((b) => {
      switch (b.kind) {
        case "p":
          return b.lines.map(strip);
        case "ul":
        case "ol":
          return b.items.map(strip);
        case "h":
          return [strip(b.text)];
        case "hr":
          return [];
      }
    })
    .join("\n");
}
