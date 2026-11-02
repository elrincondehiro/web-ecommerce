import { readFileSync } from "node:fs";
import path from "node:path";
import { COLOR_FAMILIES } from "../../lib/option-families";
import { decodeUtf8, parseCsv } from "../lib/csv";
import { planFamilies, type DbFamilyOption } from "../lib/families-plan";
import { readFamilies } from "../lib/families-sheet";

const HEADER = "opcion,familia,nombre,color,valor,familias,color_muestra";
const sheet = (rows: string[]) => readFamilies(parseCsv([HEADER, ...rows].join("\n")));
const messages = (issues: { message: string }[]) => issues.map((i) => i.message);

const db = (): DbFamilyOption[] => [
  {
    id: "opt_color",
    title: "Color",
    metadata: { filtrable: true },
    values: [
      { id: "v_sea", value: "Sea Foam", metadata: { color: "#8fd3c1" } },
      { id: "v_huck", value: "Huckleberry", metadata: null },
      { id: "v_teal", value: "Deep Teal", metadata: null },
    ],
  },
  {
    id: "opt_talla",
    title: "Talla",
    metadata: null,
    values: [{ id: "v_cm", value: "35–45 cm", metadata: null }],
  },
];

describe("familias.csv (Fase FO-2) — lectura", () => {
  it("plantilla = las 12 de color; definiciones en el orden de las filas", () => {
    const s = sheet(["Color,plantilla,,,,,", "Talla,s,Pequeña,,,,", "Talla,m,Mediana,,,,"]);
    expect(s.errors).toEqual([]);
    expect(s.definitions.map((d) => [d.option, d.families.map((f) => f.id)])).toEqual([
      ["Color", COLOR_FAMILIES.map((f) => f.id)],
      ["Talla", ["s", "m"]],
    ]);
  });

  it("asignaciones: familias normalizadas, `-` borra, color de muestra", () => {
    const s = sheet([
      "Color,,,,Sea Foam,Verde|azul,#8FD3C1",
      "Color,,,,Huckleberry,-,",
      "Color,,,,Deep Teal,,-",
    ]);
    expect(s.errors).toEqual([]);
    expect(s.assignments.map((a) => [a.value, a.families, a.swatch])).toEqual([
      ["Sea Foam", ["verde", "azul"], "#8fd3c1"],
      ["Huckleberry", [], undefined],
      ["Deep Teal", null, null],
    ]);
  });

  it("errores de formato con su línea y columna", () => {
    const s = sheet([
      ",azul,Azul,,,,",
      "Color,azul,Azul,,Sea Foam,,",
      "Color,,,,,,",
      "Color,Azul Claro,x,,,,",
      "Color,rojo,,,,,",
      "Color,verde,Verde,verde,,,",
      "Color,plantilla,Colores,,,,",
      "Color,,,,Sea Foam,a|b|c|d|e,",
      "Color,,,,Sea Foam,azul,",
      "Color,,,,Lime,,rojo",
      "Color,,,,Otro,,",
      "Color,,Nombre,,Otro2,azul,",
    ]);
    expect(s.errors.map((e) => e.line)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(messages(s.errors)).toEqual([
      expect.stringMatching(/Falta la opción/),
      expect.stringMatching(/no las dos cosas/),
      expect.stringMatching(/Falta «familia»/),
      expect.stringMatching(/no es válido/),
      expect.stringMatching(/Falta el nombre/),
      expect.stringMatching(/#rrggbb/),
      expect.stringMatching(/plantilla/),
      expect.stringMatching(/Como mucho 4/),
      expect.stringMatching(/Valor repetido/),
      expect.stringMatching(/#rrggbb/),
      expect.stringMatching(/no cambia nada/),
      expect.stringMatching(/filas que definen/),
    ]);
  });

  it("familia repetida y cabecera con columnas desconocidas", () => {
    expect(messages(sheet(["Talla,s,S,,,,", "Talla,s,Otra,,,,"]).errors)).toEqual([
      expect.stringMatching(/repetida/),
    ]);
    const bad = readFamilies(parseCsv("opcion,familia,talla\nColor,azul,x"));
    expect(messages(bad.errors)).toEqual(["Columna desconocida."]);
    expect(messages(readFamilies(parseCsv("familia\nazul")).errors)).toEqual([
      "Falta la columna «opcion».",
    ]);
  });

  it("la plantilla del repositorio se lee sin errores", () => {
    const file = path.join(__dirname, "../../../catalog/plantilla/familias.csv");
    const s = readFamilies(parseCsv(decodeUtf8(readFileSync(file))));
    expect(s.errors).toEqual([]);
    expect(s.definitions.length).toBeGreaterThan(0);
    expect(s.assignments.length).toBeGreaterThan(0);
  });
});

describe("familias.csv — plan contra Medusa", () => {
  it("define y asigna conservando el resto de la metadata", () => {
    const plan = planFamilies(
      sheet([
        "Color,plantilla,,,,,",
        "Color,,,,Sea Foam,azul|verde,",
        "Color,,,,Huckleberry,morado,#5b2a5e",
        "Color,,,,Deep Teal,azul,",
      ]),
      db(),
    );
    expect(plan.errors).toEqual([]);
    expect(plan.options).toHaveLength(1);
    expect(plan.options[0]!.metadata).toEqual({ filtrable: true, familias: COLOR_FAMILIES });
    expect(plan.values.map((v) => [v.id, v.metadata, v.changes])).toEqual([
      // en el orden de la opción (verde antes que azul) y conservando su `color`
      ["v_sea", { color: "#8fd3c1", familias: ["verde", "azul"] }, ["familias verde|azul"]],
      ["v_huck", { familias: ["morado"], color: "#5b2a5e" }, ["familias morado", "color #5b2a5e"]],
      ["v_teal", { familias: ["azul"] }, ["familias azul"]],
    ]);
    expect(plan.warnings).toEqual([]);
  });

  it("idempotente: con lo mismo en Medusa no escribe nada", () => {
    const current = db();
    current[0]!.metadata = { filtrable: true, familias: COLOR_FAMILIES.map((f) => ({ ...f })) };
    current[0]!.values[0]!.metadata = { color: "#8fd3c1", familias: ["verde", "azul"] };
    const plan = planFamilies(
      sheet(["Color,plantilla,,,,,", "Color,,,,sea foam,azul|verde,#8fd3c1"]),
      current,
    );
    expect(plan.errors).toEqual([]);
    expect(plan.options).toEqual([]);
    expect(plan.values).toEqual([]);
  });

  it("quitar: `-` en familias y en color, y una opción sin familias", () => {
    const current = db();
    current[0]!.metadata = { filtrable: true, familias: COLOR_FAMILIES };
    current[0]!.values[0]!.metadata = { color: "#8fd3c1", familias: ["verde"] };
    const plan = planFamilies(sheet(["Color,,,,Sea Foam,-,-"]), current);
    expect(plan.values.map((v) => [v.metadata, v.changes])).toEqual([
      // `""` = borrar la clave (mergeMetadata de Medusa 2.22.1)
      [{ color: "", familias: "" }, ["sin familias", "sin color"]],
    ]);
  });

  it("errores: opción o valor que no existen, familias no definidas", () => {
    const plan = planFamilies(
      sheet([
        "Sabor,pollo,Pollo,,,,",
        "Color,,,,Lunares,azul,",
        "Talla,,,,35–45 cm,s,",
        "Color,s,S,,,,",
        "Color,,,,Deep Teal,azul,",
      ]),
      db(),
    );
    expect(messages(plan.errors)).toEqual([
      expect.stringMatching(/No existe la opción «Sabor»/),
      expect.stringMatching(/no tiene el valor «Lunares»/),
      expect.stringMatching(/«Talla» no tiene familias/),
      expect.stringMatching(/no existen en «Color»: azul/),
    ]);
  });

  it("avisos: valores sin familia y familias que desaparecen", () => {
    const current = db();
    current[0]!.values[2]!.metadata = { familias: ["azul"] };
    const plan = planFamilies(
      sheet(["Color,verde,Verde,,,,", "Color,,,,Sea Foam,verde,"]),
      current,
    );
    expect(plan.errors).toEqual([]);
    expect(messages(plan.warnings)).toEqual([
      "2 valores sin familia (no saldrán en el filtro): Huckleberry, Deep Teal.",
      "«Deep Teal» tiene familias que ya no existen (azul): se ignoran.",
    ]);
  });
});
