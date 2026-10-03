import { describe, expect, it } from "vitest";
import { formatPrice } from "./format";

// Intl usa espacio duro (U+00A0) entre importe y símbolo en es-ES.
const norm = (s: string) => s.replace(/\u00a0/g, " ");

describe("formatPrice", () => {
  it("formatea euros en es-ES (unidades mayores, no céntimos)", () => {
    expect(norm(formatPrice(41.95, "eur"))).toBe("41,95 €");
    expect(norm(formatPrice(1234.5, "EUR"))).toBe("1234,50 €");
  });

  it("formatea otras divisas", () => {
    expect(norm(formatPrice(10, "usd"))).toBe("10,00 US$");
  });
});
