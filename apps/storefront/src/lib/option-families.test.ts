import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  COLOR_FAMILIES,
  FAMILY_ID_RE,
  MAX_FAMILIES,
  MAX_FAMILIES_PER_VALUE,
  familyKey,
  optionFamilies,
  parseFamilyList,
  parseOptionFamilies,
  productFamilyKeys,
  splitFamilyKey,
  valueFamilies,
  valuesWithoutFamily,
} from "./option-families";

const color = { familias: COLOR_FAMILIES };

describe("parseOptionFamilies", () => {
  it("sin metadata o vacía → opción sin familias, sin problemas", () => {
    for (const m of [null, undefined, {}, { familias: null }, { familias: "" }]) {
      expect(parseOptionFamilies(m)).toEqual({ families: [], issues: [] });
    }
  });

  it("la plantilla de color es válida: 12 familias en su orden", () => {
    const { families, issues } = parseOptionFamilies(color);
    expect(issues).toEqual([]);
    expect(families.map((f) => f.id)).toEqual([
      "negro",
      "gris",
      "blanco",
      "marron-beige",
      "rojo",
      "rosa",
      "naranja",
      "amarillo",
      "verde",
      "azul",
      "morado",
      "multicolor",
    ]);
    expect(families.every((f) => FAMILY_ID_RE.test(f.id))).toBe(true);
  });

  it("normaliza: recorta, color en minúsculas, sin color → null", () => {
    expect(
      optionFamilies({
        familias: [
          { id: " s ", nombre: " Pequeña ", color: "" },
          { id: "azul", nombre: "Azul", color: "#2F6FD1" },
        ],
      }),
    ).toEqual([
      { id: "s", nombre: "Pequeña", color: null },
      { id: "azul", nombre: "Azul", color: "#2f6fd1" },
    ]);
  });

  it("descarta las entradas no válidas y explica por qué (las demás siguen)", () => {
    const { families, issues } = parseOptionFamilies({
      familias: [
        { id: "azul", nombre: "Azul" },
        { id: "Azul Claro", nombre: "x" },
        { id: "azul", nombre: "Otra" },
        { id: "rojo", nombre: "" },
        { id: "verde", nombre: "Verde", color: "verde" },
        "texto",
      ],
    });
    expect(families.map((f) => f.id)).toEqual(["azul"]);
    expect(issues.map((i) => i.index)).toEqual([1, 2, 3, 4, 5]);
    expect(issues[0]!.message).toMatch(/no válido/);
    expect(issues[1]!.message).toMatch(/repetido/);
    expect(issues[3]!.message).toMatch(/#rrggbb/);
  });

  it("«familias» que no es una lista → un problema y ninguna familia", () => {
    expect(parseOptionFamilies({ familias: { id: "x" } })).toEqual({
      families: [],
      issues: [{ index: -1, message: "«familias» no es una lista" }],
    });
  });

  it(`como mucho ${MAX_FAMILIES} familias`, () => {
    const many = Array.from({ length: MAX_FAMILIES + 2 }, (_, i) => ({
      id: `f${i}`,
      nombre: `F${i}`,
    }));
    const { families, issues } = parseOptionFamilies({ familias: many });
    expect(families).toHaveLength(MAX_FAMILIES);
    expect(issues).toHaveLength(2);
  });
});

describe("valueFamilies", () => {
  const families = optionFamilies(color);

  it("solo las que existen en la opción, en el orden de la opción, sin repetir", () => {
    expect(valueFamilies({ familias: ["azul", "verde", "azul", "fucsia"] }, families)).toEqual([
      "verde",
      "azul",
    ]);
  });

  it("acepta el texto de la hoja (`verde|azul`)", () => {
    expect(valueFamilies({ familias: " azul | verde " }, families)).toEqual(["verde", "azul"]);
  });

  it(`como mucho ${MAX_FAMILIES_PER_VALUE} por valor`, () => {
    expect(valueFamilies({ familias: COLOR_FAMILIES.map((f) => f.id) }, families)).toHaveLength(
      MAX_FAMILIES_PER_VALUE,
    );
  });

  it("sin familias en el valor o en la opción → []", () => {
    expect(valueFamilies(null, families)).toEqual([]);
    expect(valueFamilies({ familias: 3 }, families)).toEqual([]);
    expect(valueFamilies({ familias: ["azul"] }, [])).toEqual([]);
  });
});

describe("parseFamilyList", () => {
  it("separa por `|`, recorta, minúsculas y sin repetir", () => {
    expect(parseFamilyList(" Verde | azul ||verde")).toEqual(["verde", "azul"]);
    expect(parseFamilyList("")).toEqual([]);
  });
});

describe("claves «Título:id»", () => {
  it("familyKey / splitFamilyKey (el título puede llevar «:»)", () => {
    expect(familyKey("Color", "azul")).toBe("Color:azul");
    expect(splitFamilyKey("Color:azul")).toEqual({ title: "Color", id: "azul" });
    expect(splitFamilyKey("Talla: perro:m")).toEqual({ title: "Talla: perro", id: "m" });
    expect(splitFamilyKey("Color:Azul")).toBeNull();
    expect(splitFamilyKey(":azul")).toBeNull();
    expect(splitFamilyKey("sin-dos-puntos")).toBeNull();
  });
});

describe("productFamilyKeys y valuesWithoutFamily", () => {
  const options = [
    {
      title: "Color",
      metadata: color,
      values: [
        { value: "Sea Foam", metadata: { familias: ["verde", "azul"] } },
        { value: "Huckleberry", metadata: { familias: ["morado"] } },
        { value: "Deep Teal", metadata: { familias: ["azul"] } },
        { value: "Sin asignar", metadata: null },
      ],
    },
    {
      title: "Talla",
      metadata: {
        familias: [
          { id: "s", nombre: "S" },
          { id: "m", nombre: "M" },
        ],
      },
      values: [{ value: "35–45 cm", metadata: { familias: "s|m" } }],
    },
    // Opción sin familias: no aporta claves
    { title: "Sabor", metadata: null, values: [{ value: "Pollo", metadata: { familias: ["x"] } }] },
    null,
  ];

  it("claves de todas las opciones con familias, sin repetir", () => {
    expect(productFamilyKeys(options)).toEqual([
      "Color:verde",
      "Color:azul",
      "Color:morado",
      "Talla:s",
      "Talla:m",
    ]);
    expect(productFamilyKeys(null)).toEqual([]);
  });

  it("valores sin familia (avisos del dry-run y del widget)", () => {
    expect(valuesWithoutFamily(options[0])).toEqual(["Sin asignar"]);
    expect(valuesWithoutFamily(options[2])).toEqual([]);
  });
});

describe("copia del backend", () => {
  it("apps/backend/src/lib/option-families.ts es idéntico a este fichero", () => {
    const here = readFileSync(new URL("./option-families.ts", import.meta.url), "utf8");
    const backend = readFileSync(
      new URL("../../../backend/src/lib/option-families.ts", import.meta.url),
      "utf8",
    );
    expect(backend).toBe(here);
  });
});
