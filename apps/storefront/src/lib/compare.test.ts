import { describe, expect, it } from "vitest";
import type { StoreProduct } from "./catalog";
import {
  compareCategoryUrl,
  comparePickUrl,
  compareRow,
  estimatedCarbsMs,
  hasAnalytics,
  parsePicked,
  perKgDryMatter,
  showCompareToggle,
} from "./compare";

const variant = (amount: number, netG?: number) => ({
  id: `variant_${amount}`,
  title: `${netG ?? 0} g`,
  manage_inventory: false,
  metadata: netG ? { neto_g: netG } : {},
  calculated_price: { calculated_amount_with_tax: amount, currency_code: "eur" },
});
const product = (metadata: Record<string, unknown>, variants = [variant(10, 1000)]) =>
  ({ id: "prod_1", handle: "x", title: "X", metadata, variants }) as unknown as StoreProduct;

const PIENSO = { proteina_pct: 25, grasa_pct: 15, fibra_pct: 3, cenizas_pct: 7, humedad_pct: 9 };

describe("comparador (Fase MK-C)", () => {
  it("datos analíticos: humedad válida y proteína", () => {
    expect(hasAnalytics(product(PIENSO))).toBe(true);
    expect(hasAnalytics(product({ proteina_pct: 25 }))).toBe(false);
    expect(hasAnalytics(product({ humedad_pct: 100, proteina_pct: 1 }))).toBe(false);
    expect(showCompareToggle([product({}), product(PIENSO)])).toBe(true);
    expect(showCompareToggle([product({})])).toBe(false);
  });

  it("hidratos estimados sobre materia seca: todo o nada, nunca negativos", () => {
    // 100 − 25 − 15 − 3 − 7 − 9 = 41 → 41 / 91 = 45,1 %
    expect(estimatedCarbsMs(PIENSO)).toBe(45.1);
    expect(estimatedCarbsMs({ ...PIENSO, fibra_pct: undefined })).toBeNull();
    expect(estimatedCarbsMs({ ...PIENSO, proteina_pct: 70 })).toBeNull();
    // Justo 0 (redondeos de la etiqueta): 0
    expect(estimatedCarbsMs({ ...PIENSO, proteina_pct: 66 })).toBe(0);
  });

  it("€/kg de materia seca", () => {
    expect(perKgDryMatter(10, 9)).toBe(10.99);
    expect(perKgDryMatter(8.73, 78)).toBe(39.68);
    expect(perKgDryMatter(null, 9)).toBeNull();
    expect(perKgDryMatter(10, null)).toBeNull();
  });

  it("fila: componentes MS, humedad y el formato más barato por kilo", () => {
    const row = compareRow(product(PIENSO, [variant(31.95, 3000), variant(76.95, 12000)]));
    expect(row.ms.proteina_pct).toBe(27.5);
    expect(row.ms.grasa_pct).toBe(16.5);
    expect(row.moisture).toBe(9);
    expect(row.perKg).toBe(6.41);
    expect(row.perKgMs).toBe(7.04);
    expect(row.carbsMs).toBe(45.1);
    const ml = compareRow(product(PIENSO, [variant(5, 0)]));
    expect([ml.perKg, ml.perKgMs]).toEqual([null, null]);
  });

  it("elegidos: válidos, sin repetir, como mucho 4 y cuántos sobran", () => {
    expect(parsePicked(["prod_1", "x", "prod_1", "prod_2"])).toEqual({
      ids: ["prod_1", "prod_2"],
      extra: 0,
    });
    expect(parsePicked(["prod_1", "prod_2", "prod_3", "prod_4", "prod_5"]).extra).toBe(1);
    expect(comparePickUrl(["prod_1", "prod_2"])).toBe("/comparar/elegidos/?p=prod_1&p=prod_2");
    expect(compareCategoryUrl("piensos-perro", "prod_1")).toBe(
      "/comparar/?categoria=piensos-perro&marcar=prod_1",
    );
  });
});
