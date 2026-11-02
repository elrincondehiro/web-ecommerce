import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { FamilyCatalog, ListingFacets } from "./facets";
import { catalogSwatchCss, swatchClass, swatchCss } from "./family-swatches";

const facets = (colors: (string | null)[]): ListingFacets => ({
  groups: [
    {
      key: "familia",
      title: "Color",
      values: colors.map((color, i) => ({ value: `Color:f${i}`, label: `F${i}`, color })),
    },
    // Otros grupos no aportan reglas
    { key: "opcion", title: "Tamaño", values: [{ value: "Tamaño:3 kg", label: "3 kg" }] },
  ],
  price: null,
  stockFilter: false,
  ms: {},
});

describe("puntos de color de las familias (Fase FO)", () => {
  it("clase por color (minúsculas) o sin color", () => {
    expect(swatchClass("#2F6FD1")).toBe("fam-c-2f6fd1");
    expect(swatchClass(null)).toBe("fam-c-none");
    expect(swatchClass("rojo; } body {")).toBe("fam-c-none");
  });

  it("reglas solo de los colores del panel (todos, también los de la plantilla), sin repetir", () => {
    expect(swatchCss(facets(["#5b2a5e", "#5B2A5E", "#2f6fd1", null, "rojo"]))).toBe(
      ".fam-c-2f6fd1{--fam:#2f6fd1}.fam-c-5b2a5e{--fam:#5b2a5e}",
    );
    expect(swatchCss(facets([null]))).toBe("");
    expect(swatchCss(null)).toBe("");
  });

  it("/buscar/: las de todas las familias del catálogo", () => {
    const catalog: FamilyCatalog = new Map([
      [
        "Color",
        [
          { id: "azul", nombre: "Azul", color: "#2f6fd1" },
          { id: "multi", nombre: "Multi", color: null },
        ],
      ],
      ["Estampado", [{ id: "flores", nombre: "Flores", color: "#2F6FD1" }]],
    ]);
    expect(catalogSwatchCss(catalog)).toBe(".fam-c-2f6fd1{--fam:#2f6fd1}");
    expect(catalogSwatchCss(new Map())).toBe("");
  });

  it("global.css (común a todas las páginas) no lleva colores de familias", () => {
    const css = readFileSync(new URL("../styles/global.css", import.meta.url), "utf8");
    expect(css).not.toMatch(/\.fam-c-[0-9a-f]{6}/);
  });
});
