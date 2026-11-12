import { describe, expect, it } from "vitest";
import { daySeed, floatingCss, random, rainbowDuration, shuffle, splitGoneLabel } from "./showcase";

describe("escaparate (Fase MK-D)", () => {
  it("aleatorio determinista: misma semilla, mismo resultado", () => {
    const a = random(42);
    const b = random(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(shuffle([1, 2, 3, 4, 5], 7)).toEqual(shuffle([1, 2, 3, 4, 5], 7));
    expect(shuffle([1, 2, 3, 4, 5], 7).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("semilla del día en Madrid", () => {
    expect(daySeed(new Date("2026-12-31T23:30:00Z"))).toBe(20270101);
  });

  it("CSS: una animación por tarjeta, suave y sin nada que la CSP bloquee", () => {
    const css = floatingCss(3, 1);
    expect(css.match(/@keyframes peque-\d/g)).toHaveLength(3);
    expect(css).toContain(".peque-2{animation:peque-2 ");
    // desplazamientos pequeños (±14 px) y duraciones de 14 a 26 s
    for (const m of css.matchAll(/translate\((-?[\d.]+)px,(-?[\d.]+)px\)/g)) {
      expect(Math.abs(Number(m[1]))).toBeLessThanOrEqual(14);
    }
    for (const m of css.matchAll(/animation:peque-\d+ ([\d.]+)s/g)) {
      expect(Number(m[1])).toBeGreaterThanOrEqual(14);
      expect(Number(m[1])).toBeLessThanOrEqual(26);
    }
    expect(css).not.toMatch(/url\(|expression|<\//);
    expect(rainbowDuration(2)).toBe(30);
    expect(rainbowDuration(10)).toBe(80);
  });
});

describe("arcoíris (Fase MK-D)", () => {
  it("nombre y años por separado", () => {
    expect(splitGoneLabel("Hiro · 2009–2023", "Hiro")).toEqual({
      name: "Hiro",
      years: "2009–2023",
    });
    expect(splitGoneLabel("Luna · †2020", "Luna")).toEqual({ name: "Luna", years: "†2020" });
    expect(splitGoneLabel(null, "Nube")).toEqual({ name: "Nube", years: null });
  });
});
