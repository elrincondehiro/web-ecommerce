// Fase FO: el comportamiento completo se prueba en el storefront (option-families.test.ts, que
// además comprueba que las dos copias son idénticas). Aquí, lo que usa el backend: claves del
// índice, validación para el dry-run y la hoja.
import {
  COLOR_FAMILIES,
  parseFamilyList,
  parseOptionFamilies,
  productFamilyKeys,
  valuesWithoutFamily,
} from "../option-families";

describe("familias de opciones (Fase FO)", () => {
  const color = {
    title: "Color",
    metadata: { familias: COLOR_FAMILIES },
    values: [
      { value: "Sea Foam", metadata: { familias: ["verde", "azul"] } },
      { value: "Woodland", metadata: { familias: "verde" } },
      { value: "Nuevo", metadata: null },
    ],
  };

  it("claves del índice «Título:id» de las opciones con familias", () => {
    expect(productFamilyKeys([color, { title: "Sabor", values: [{ value: "Pollo" }] }])).toEqual([
      "Color:verde",
      "Color:azul",
    ]);
  });

  it("plantilla de color válida y avisos de valores sin familia", () => {
    expect(parseOptionFamilies(color.metadata).issues).toEqual([]);
    expect(valuesWithoutFamily(color)).toEqual(["Nuevo"]);
  });

  it("celda de la hoja", () => {
    expect(parseFamilyList("Verde|AZUL| verde")).toEqual(["verde", "azul"]);
  });
});
