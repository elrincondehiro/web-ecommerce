import { describe, expect, it } from "vitest";
import {
  BULK_MAX_G,
  bulkRule,
  checkGrams,
  commonRule,
  formatGrams,
  formatStockGrams,
  kgPrice,
  lineGrams,
  lineQuantityLabel,
  minUnits,
  quickGrams,
  unitsAmount,
} from "./bulk";

const nb = (s: string) => s.replace(/\u00a0/g, " ");
const rule = { stepG: 5, minG: 100 };

describe("bulkRule", () => {
  it("lee paso_g y min_g (enteros > 0); sin mínimo = un paso", () => {
    expect(bulkRule({ paso_g: 5, min_g: 100 })).toEqual(rule);
    expect(bulkRule({ paso_g: 10 })).toEqual({ stepG: 10, minG: 10 });
    expect(bulkRule({ paso_g: 0 })).toBeNull();
    expect(bulkRule({ paso_g: "5" })).toBeNull();
    expect(bulkRule({ neto_g: 400 })).toBeNull();
    expect(bulkRule(null)).toBeNull();
  });
});

describe("importes", () => {
  it("pasos del mínimo, precio del mínimo y €/kg en céntimos exactos", () => {
    expect(minUnits(rule)).toBe(20);
    expect(minUnits({ stepG: 25, minG: 110 })).toBe(5);
    expect(unitsAmount(0.1, 20)).toBe(2);
    expect(unitsAmount(0.09, 3)).toBe(0.27);
    expect(kgPrice(0.1, rule)).toBe(20);
    expect(kgPrice(0.12, rule)).toBe(24);
  });
});

describe("checkGrams", () => {
  it("múltiplo del paso, mínimo y máximo (contando lo que ya hay)", () => {
    expect(checkGrams(250, rule)).toEqual({ ok: true, units: 50 });
    expect(checkGrams(252, rule)).toEqual({ ok: false, code: "invalid" });
    expect(checkGrams(0, rule)).toEqual({ ok: false, code: "invalid" });
    expect(checkGrams(1.5, rule)).toEqual({ ok: false, code: "invalid" });
    expect(checkGrams(95, rule)).toEqual({ ok: false, code: "minimum" });
    // Ya hay 100 g en el carrito: 5 g más valen
    expect(checkGrams(5, rule, 100)).toEqual({ ok: true, units: 1 });
    expect(checkGrams(BULK_MAX_G, rule)).toEqual({ ok: true, units: BULK_MAX_G / 5 });
    expect(checkGrams(BULK_MAX_G + 5, rule)).toEqual({ ok: false, code: "maximum" });
    expect(checkGrams(100, rule, BULK_MAX_G - 50)).toEqual({ ok: false, code: "maximum" });
  });
});

describe("commonRule y quickGrams", () => {
  it("varias variantes: mcm de pasos y el mayor mínimo redondeado", () => {
    expect(commonRule([rule])).toEqual(rule);
    expect(commonRule([rule, { stepG: 10, minG: 50 }])).toEqual({ stepG: 10, minG: 100 });
    expect(
      commonRule([
        { stepG: 25, minG: 25 },
        { stepG: 10, minG: 120 },
      ]),
    ).toEqual({
      stepG: 50,
      minG: 150,
    });
    expect(commonRule([])).toBeNull();
  });
  it("accesos rápidos que cumplen la regla", () => {
    expect(quickGrams(rule)).toEqual([100, 250, 500, 1000]);
    expect(quickGrams({ stepG: 100, minG: 200 })).toEqual([500, 1000]);
  });
});

describe("formato", () => {
  it("gramos y kilos", () => {
    expect(nb(formatGrams(250))).toBe("250 g");
    expect(nb(formatGrams(1000))).toBe("1 kg");
    expect(nb(formatGrams(2450))).toBe("2,45 kg");
  });
  it("stock: desde 1 kg, redondeado hacia abajo a 100 g", () => {
    expect(nb(formatStockGrams(2480))).toBe("2,4 kg");
    expect(nb(formatStockGrams(950))).toBe("950 g");
  });
  it("líneas: gramos (granel) o unidades", () => {
    const bulk = { quantity: 50, variant: { metadata: { paso_g: 5, min_g: 100 } } };
    expect(lineGrams(bulk)).toBe(250);
    expect(nb(lineQuantityLabel(bulk))).toBe("250 g ·");
    expect(lineGrams({ quantity: 2, variant: null })).toBeNull();
    expect(lineQuantityLabel({ quantity: 2 })).toBe("2 ×");
  });
});
