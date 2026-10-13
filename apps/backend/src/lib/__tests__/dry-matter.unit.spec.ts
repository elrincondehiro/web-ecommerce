import { dryMatter } from "../dry-matter";

describe("dryMatter (S-2)", () => {
  it("convierte a materia seca con un decimal", () => {
    expect(dryMatter({ proteina_pct: 25, humedad_pct: 9 }, "proteina_pct")).toBe(27.5);
    // lata: 9 % con 75 % de humedad → 36 % s.m.
    expect(dryMatter({ proteina_pct: 9, humedad_pct: 75 }, "proteina_pct")).toBe(36);
    expect(dryMatter({ grasa_pct: 0, humedad_pct: 10 }, "grasa_pct")).toBe(0);
  });
  it("sin dato o humedad inválida → undefined", () => {
    expect(dryMatter({ proteina_pct: 25 }, "proteina_pct")).toBeUndefined();
    expect(dryMatter({ humedad_pct: 9 }, "proteina_pct")).toBeUndefined();
    expect(dryMatter({ proteina_pct: 25, humedad_pct: 100 }, "proteina_pct")).toBeUndefined();
    expect(dryMatter({ proteina_pct: "25", humedad_pct: 9 }, "proteina_pct")).toBeUndefined();
    expect(dryMatter(null, "proteina_pct")).toBeUndefined();
  });
});
