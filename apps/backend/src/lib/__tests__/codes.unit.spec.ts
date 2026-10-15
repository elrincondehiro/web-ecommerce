import { codeDiscount, customerCodes, itemsAfterCode, normalizeCode } from "../codes";
import { maxRedeemable } from "../points";

describe("códigos descuento (Fase P)", () => {
  it("normaliza (mayúsculas, sin espacios) y rechaza formato no válido y códigos de puntos", () => {
    expect(normalizeCode(" hiro10 ")).toBe("HIRO10");
    expect(normalizeCode("VERANO_26-B")).toBe("VERANO_26-B");
    expect(normalizeCode("A")).toBeNull();
    expect(normalizeCode("con espacio")).toBeNull();
    expect(normalizeCode("PTS-ABC")).toBeNull();
    expect(normalizeCode(42)).toBeNull();
  });

  it("descuento del código: ajustes que no son de puntos", () => {
    const items = [
      {
        adjustments: [
          { code: "HIRO10", amount: 3 },
          { code: "PTS-X", amount: 5 },
        ],
      },
      { adjustments: [{ code: "HIRO10", amount: 7.01 }] },
      null,
    ];
    expect(codeDiscount(items)).toEqual({ code: "HIRO10", amount: 10.01 });
    expect(codeDiscount([])).toEqual({ code: null, amount: 0 });
    expect(customerCodes([{ code: "PTS-1" }, { code: "A10" }, null])).toEqual(["A10"]);
  });

  it("tope de puntos tras el código: siempre ≥ 0,50 € por pagar", () => {
    // 30 € de productos, código de 20 €, sin envío → máx. 9,50 €
    expect(maxRedeemable(100, itemsAfterCode(30, 20), 0)).toBe(9.5);
    // con 4,95 € de envío → los 10 € que quedan
    expect(maxRedeemable(100, itemsAfterCode(30, 20), 4.95)).toBe(10);
    // código que cubre todo: no quedan puntos
    expect(maxRedeemable(100, itemsAfterCode(30, 30), 0)).toBe(0);
  });
});
