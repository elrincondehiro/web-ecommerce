import { describe, expect, it } from "vitest";
import { RESTRICTION_TEXT, productRestrictions } from "./product-flags";

describe("restricciones de producto (Fase CS)", () => {
  it("pago_descuento = no y genera_puntos = no; por defecto, ninguna", () => {
    expect(
      productRestrictions({ discountable: false, metadata: { genera_puntos: false } }),
    ).toEqual([RESTRICTION_TEXT.noDiscount, RESTRICTION_TEXT.noPoints]);
    expect(productRestrictions({ discountable: true, metadata: {} })).toEqual([]);
    expect(productRestrictions({ metadata: { genera_puntos: "" } })).toEqual([]);
    expect(productRestrictions(null)).toEqual([]);
    expect(productRestrictions(undefined)).toEqual([]);
  });
});
