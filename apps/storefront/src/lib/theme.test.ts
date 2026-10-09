// Contraste de los colores del tema (I-Marca): WCAG 2.x AA (≥ 4,5:1 texto normal) en claro y
// oscuro. Lee los tokens de global.css: cada uno lleva su hexadecimal en un comentario
// (`--x: oklch(...); /* #RRGGBB */`), que es lo que se mide. Si cambias un oklch, cambia el hex.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../styles/global.css", import.meta.url), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no está el bloque ${selector}`);
  const body = css.slice(start, css.indexOf("}", start));
  const tokens: Record<string, string> = {};
  for (const m of body.matchAll(
    /--([a-z-]+):\s*([^;]+);(?:\s*\/\*\s*(#[0-9A-Fa-f]{6})\s*\*\/)?/g,
  )) {
    const [, name, value, hex] = m;
    tokens[name!] = hex ?? value!.trim();
  }
  return tokens;
}
const light = block('[data-theme="light"]');
const darkExplicit = block('[data-theme="dark"]');
const darkSystem = block(':root:not([data-theme="light"])');
const aliases = block("[data-theme]");
Object.assign(light, aliases);
const dark = { ...light, ...darkExplicit };
const resolve = (t: Record<string, string>, k: string): string => {
  const v = t[k];
  if (!v) throw new Error(`falta --${k}`);
  const ref = /^var\(--([a-z-]+)\)$/.exec(v);
  if (ref) return resolve(t, ref[1]!);
  if (!/^#[0-9A-Fa-f]{6}$/.test(v)) throw new Error(`--${k} sin hex en comentario: ${v}`);
  return v;
};

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

/** [texto, fondo] que se usan juntos en la web. */
const PAIRS: [string, string][] = [
  ["foreground", "background"],
  ["card-foreground", "card"],
  ["popover-foreground", "popover"],
  ["foreground", "muted"],
  ["primary-foreground", "primary"],
  ["primary", "background"],
  ["primary", "card"],
  ["secondary-foreground", "secondary"],
  ["muted-foreground", "background"],
  ["muted-foreground", "muted"],
  ["muted-foreground", "card"],
  ["accent-foreground", "accent"],
  ["accent-text", "background"],
  ["accent-text", "card"],
  ["destructive", "background"],
  ["destructive-foreground", "destructive"],
  ["success", "background"],
];

describe.each([
  ["claro", light],
  ["oscuro", dark],
])("contraste AA, modo %s", (_, tokens) => {
  it.each(PAIRS)("%s sobre %s ≥ 4,5:1", (fg, bg) => {
    expect(contrast(resolve(tokens, fg), resolve(tokens, bg))).toBeGreaterThanOrEqual(4.5);
  });
});

// Bordes de controles y tarjetas (--line): WCAG 1.4.11, contraste no textual ≥ 3:1 (Fase D).
describe.each([
  ["claro", light],
  ["oscuro", dark],
])("borde --line ≥ 3:1, modo %s", (_, tokens) => {
  it.each(["background", "card", "muted"])("sobre %s", (bg) => {
    expect(contrast(resolve(tokens, "line"), resolve(tokens, bg))).toBeGreaterThanOrEqual(3);
  });
});

it("el oscuro explícito y el del sistema son iguales", () => {
  expect(darkSystem).toEqual(darkExplicit);
});

it("el rosa de marca no vale como texto sobre fondo claro (por eso existe --accent-text)", () => {
  expect(contrast(resolve(light, "accent"), resolve(light, "background"))).toBeLessThan(4.5);
});
