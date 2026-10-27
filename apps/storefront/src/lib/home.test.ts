import { describe, expect, it } from "vitest";
import { featuredCategories, isNew, newProducts, orderedBlocks, tagChips } from "./home";

describe("home (Fase H)", () => {
  it("orderedBlocks: solo los presentes, de menor a mayor orden", () => {
    expect(
      orderedBlocks({
        categorias: { orden: 2 },
        destacados: { orden: 1 },
        valores: { orden: 9 },
      }),
    ).toEqual(["destacados", "categorias", "valores"]);
    expect(orderedBlocks({ categorias: { orden: 1 } })).toEqual(["categorias"]);
  });

  it("orderedBlocks: un orden repetido es un error", () => {
    expect(() => orderedBlocks({ categorias: { orden: 1 }, ofertas: { orden: 1 } })).toThrow(
      /mismo orden \(1\)/,
    );
  });

  it("featuredCategories: orden del yaml, sin repetidas; avisa de las que faltan", () => {
    const byHandle = new Map([
      ["perro", "P"],
      ["gato", "G"],
      ["juguetes-gato", "J"],
    ]);
    expect(featuredCategories(["juguetes-gato", "nope", "perro", "perro"], byHandle)).toEqual({
      categories: ["J", "P"],
      missing: ["nope"],
    });
  });

  it("featuredCategories: sin ninguna válida, error (nunca una home sin categorías)", () => {
    expect(() => featuredCategories(["nope"], new Map())).toThrow(/ninguna de las categorías/);
  });
});

describe("novedades y etiquetas (Fase H, c y d)", () => {
  const now = new Date("2026-11-20T10:00:00Z");
  const p = (created: string | null, tags: string[] = []) => ({
    created_at: created,
    tags: tags.map((value) => ({ value })),
  });

  it("isNew: últimos N días, fecha de corte y etiqueta «novedad»", () => {
    const rule = { dias: 30, desde: "2026-11-01" };
    expect(isNew(p("2026-11-10T00:00:00Z"), rule, now)).toBe(true);
    // dentro de los 30 días pero antes del corte (carga inicial): no
    expect(isNew(p("2026-10-25T00:00:00Z"), rule, now)).toBe(false);
    // con la etiqueta, siempre (mayúsculas y espacios dan igual)
    expect(isNew(p("2025-01-01T00:00:00Z", [" Novedad "]), rule, now)).toBe(true);
    // más de 30 días
    expect(isNew(p("2026-10-01T00:00:00Z"), { dias: 30 }, now)).toBe(false);
    expect(isNew(p("2026-10-22T00:00:00Z"), { dias: 30 }, now)).toBe(true);
    expect(isNew(p(null), { dias: 30 }, now)).toBe(false);
  });

  it("newProducts: de la más reciente a la más antigua", () => {
    const list = [
      { id: "a", ...p("2026-11-05T00:00:00Z") },
      { id: "b", ...p("2024-01-01T00:00:00Z", ["novedad"]) },
      { id: "c", ...p("2026-11-15T00:00:00Z") },
      { id: "d", ...p("2026-01-01T00:00:00Z") },
    ];
    expect(newProducts(list, { dias: 30 }, now).map((x) => x.id)).toEqual(["c", "a", "b"]);
  });

  it("tagChips: orden del yaml, solo con productos, con su número", () => {
    const products = [p(null, ["natural", "sin cereales"]), p(null, ["natural", "natural"])];
    expect(tagChips(["sin cereales", "hipoalergénico", "natural", "natural"], products)).toEqual([
      { value: "sin cereales", count: 1 },
      { value: "natural", count: 2 },
    ]);
  });
});
