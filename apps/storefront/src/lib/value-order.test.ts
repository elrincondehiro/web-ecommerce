import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compareValues, compareVariants } from "./value-order";

describe("orden natural de valores (fase 13)", () => {
  it("tallas en su orden", () => {
    expect(["XL", "S", "xs", "M", "L"].sort(compareValues)).toEqual(["xs", "S", "M", "L", "XL"]);
  });
  it("cantidades por su magnitud (misma magnitud)", () => {
    expect(["1 kg", "250 g", "500g", "2 kg"].sort(compareValues)).toEqual([
      "250 g",
      "500g",
      "1 kg",
      "2 kg",
    ]);
    expect(["1 l", "500 ml", "1,5 l"].sort(compareValues)).toEqual(["500 ml", "1 l", "1,5 l"]);
    expect(["120 cm", "1 m", "90 cm"].sort(compareValues)).toEqual(["90 cm", "1 m", "120 cm"]);
  });
  it("el resto alfabético con números", () => {
    expect(["Talla 10", "Talla 2", "azul", "Árbol"].sort(compareValues)).toEqual([
      "Árbol",
      "azul",
      "Talla 2",
      "Talla 10",
    ]);
  });
  it("variantes: rango y, con el mismo, valores", () => {
    const v = (rank: number | null, ...values: string[]) => ({ variant_rank: rank, values });
    expect(
      [v(0, "L"), v(0, "S"), v(null, "M")].sort(compareVariants).map((x) => x.values[0]),
    ).toEqual(["S", "M", "L"]);
    expect([v(2, "S"), v(1, "L")].sort(compareVariants).map((x) => x.values[0])).toEqual([
      "L",
      "S",
    ]);
  });
  it("apps/backend/src/lib/value-order.ts es idéntico a este fichero", () => {
    const here = readFileSync(new URL("./value-order.ts", import.meta.url), "utf8");
    const backend = readFileSync(
      new URL("../../../backend/src/lib/value-order.ts", import.meta.url),
      "utf8",
    );
    expect(backend).toBe(here);
  });
});
