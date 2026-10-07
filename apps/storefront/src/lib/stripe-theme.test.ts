// Los colores de Stripe (hex, Stripe no admite oklch) deben seguir a los tokens de global.css.
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { STRIPE_THEME } from "./stripe-theme";

const css = readFileSync(new URL("../styles/global.css", import.meta.url), "utf8");
const hex = (selector: string, token: string) => {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf("}", start));
  const m = new RegExp(`--${token}:[^;]+;\\s*/\\*\\s*(#[0-9A-Fa-f]{6})`).exec(body);
  if (!m) throw new Error(`--${token} sin hex en ${selector}`);
  return m[1]!.toUpperCase();
};

it.each([
  [
    "light",
    '[data-theme="light"]',
    {
      colorPrimary: "primary",
      colorBackground: "card",
      colorText: "foreground",
      colorDanger: "destructive",
    },
  ],
  [
    "dark",
    '[data-theme="dark"]',
    {
      colorPrimary: "primary",
      colorBackground: "card",
      colorText: "foreground",
      colorDanger: "destructive",
    },
  ],
] as const)("Stripe %s = tokens de global.css", (mode, selector, map) => {
  for (const [variable, token] of Object.entries(map)) {
    expect(STRIPE_THEME[mode].variables[variable as keyof typeof map], variable).toBe(
      hex(selector, token),
    );
  }
});
