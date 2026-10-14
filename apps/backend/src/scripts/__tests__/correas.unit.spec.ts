import { readFileSync } from "node:fs";
import path from "node:path";
import { CORREA_FILES, readCorreaSheets } from "../lib/correas-sheet";
import {
  OPTION_DOG,
  OPTION_HAND,
  OPTION_LENGTH,
  buildWanted,
  planCorreas,
  type DbCorreaProduct,
  type ProductWanted,
} from "../lib/correas-plan";
import { exactRange, lineMetadataError } from "../../lib/correas";
import { sharedDemand, shortages, variantUnits } from "../../lib/kit-demand";
import { availabilityOf } from "../../api/store/correas/disponibilidad/route";

const DIR = path.join(__dirname, "../../../catalog/plantilla/correas");
const texts = () =>
  Object.fromEntries(
    Object.values(CORREA_FILES).map((f) => [f, readFileSync(path.join(DIR, f), "utf8")]),
  ) as Record<string, string | null>;

const sheets = () => {
  const r = readCorreaSheets(texts());
  expect(r.errors).toEqual([]);
  return r.sheets;
};

/** Lo que devolvería Medusa tras crear `want` (piezas con id = `id:<sku>`). */
function asDb(want: ProductWanted, categoryId: string): DbCorreaProduct {
  return {
    id: `prod_${want.handle}`,
    handle: want.handle,
    title: want.title,
    description: want.description,
    material: want.material,
    status: want.status,
    metadata: { ...want.metadata },
    categoryIds: [categoryId],
    options: new Map(want.options.map((o, i) => [o.title, { id: `opt_${i}`, values: o.values }])),
    variants: want.variants.map((v, i) => ({
      id: `var_${i}`,
      sku: v.sku,
      title: v.title,
      options: { ...v.options },
      basePrice: { id: `price_${i}`, amount: v.price },
      weight: v.weight,
      metadata: { ...v.metadata },
      kit: new Map(v.kit.map((k) => [`id:${k.sku}`, k.quantity])),
    })),
  };
}

describe("correas: hojas de la plantilla", () => {
  it("6 correas × 117 variantes; precios, pesos y kits", () => {
    const wanted = buildWanted(sheets());
    expect(wanted.category).toBe("correas-perro");
    expect(wanted.products).toHaveLength(6);
    expect(wanted.pieces.map((p) => p.sku)).toContain("PIEZA-ANILLA");
    const pvc = wanted.products.find((p) => p.handle === "correa-rojo-pvc")!;
    expect(pvc.variants).toHaveLength(117);
    expect(pvc.metadata).toMatchObject({ plantilla: "correa", grupo: "correa", color: "Rojo" });
    expect(pvc.options.map((o) => o.title)).toEqual([OPTION_LENGTH, OPTION_DOG, OPTION_HAND]);
    const v = (sku: string) => pvc.variants.find((x) => x.sku === sku)!;
    // Tabla aprobada: 3 m 25 €, 4 m 26,50, 5 m 28, +1 €/m hasta 15 m = 38 € (PVC)
    expect(v("CORREA-ROJO-PVC-03-EST-EST").price).toBe(25);
    expect(v("CORREA-ROJO-PVC-04-EST-EST").price).toBe(26.5);
    expect(v("CORREA-ROJO-PVC-05-EST-EST").price).toBe(28);
    expect(v("CORREA-ROJO-PVC-15-EST-EST").price).toBe(38);
    expect(v("CORREA-ROJO-PVC-07-MON-SEG").price).toBe(38); // 30 + 3 + 5
    expect(v("CORREA-ROJO-PVC-15-SEG-SEG").price).toBe(48);
    const nylon = wanted.products.find((p) => p.handle === "correa-rojo-nylon")!;
    expect(nylon.variants.find((x) => x.sku === "CORREA-ROJO-NYLON-03-EST-EST")!.price).toBe(24);
    // Peso: 250 g + 80 g/m (PVC) · 60 g/m (nailon)
    expect(v("CORREA-ROJO-PVC-08-EST-EST").weight).toBe(250 + 8 * 80);
    expect(nylon.variants.find((x) => x.sku === "CORREA-ROJO-NYLON-08-EST-EST")!.weight).toBe(
      250 + 8 * 60,
    );
    // Kit: cuerda largo + 0,5 m; dos mosquetones iguales = un enlace × 2
    expect(v("CORREA-ROJO-PVC-07-MON-SEG").kit).toEqual([
      { sku: "CUERDA-ROJO-PVC", quantity: 7.5 },
      { sku: "PIEZA-MOSQ-MON", quantity: 1 },
      { sku: "PIEZA-MOSQ-SEG", quantity: 1 },
      { sku: "PIEZA-ANILLA", quantity: 3 },
      { sku: "PIEZA-HEBILLA", quantity: 2 },
    ]);
    expect(v("CORREA-ROJO-PVC-03-EST-EST").kit).toContainEqual({
      sku: "PIEZA-MOSQ-EST",
      quantity: 2,
    });
    expect(v("CORREA-ROJO-PVC-07-MON-SEG").metadata).toEqual({
      largo_m: 7,
      mosqueton_perro: "MON",
      mosqueton_mano: "SEG",
    });
  });

  it("errores de hoja: fichero que falta, SKU de pieza repetido, largo no válido", () => {
    const t = texts();
    t[CORREA_FILES.parts] = null;
    expect(readCorreaSheets(t).errors.map((e) => e.message)).toContain("Falta el fichero.");
    const t2 = texts();
    t2[CORREA_FILES.lengths] = "largo_m,suplemento\n3,0\n3,1\n2.5,0\n";
    t2[CORREA_FILES.parts] = "sku,nombre,por_correa\nPIEZA-MOSQ-EST,Anilla,3\n";
    const msgs = readCorreaSheets(t2).errors.map((e) => `${e.file}:${e.message}`);
    expect(msgs).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/largos\.csv:Repetido/),
        expect.stringMatching(/largos\.csv:Metros enteros/),
        expect.stringMatching(/piezas\.csv:SKU de pieza repetido/),
      ]),
    );
  });

  it("color_hex: opcional, en la metadata del producto; formato validado", () => {
    const azul = buildWanted(sheets()).products.find((p) => p.handle === "correa-azul-nylon")!;
    expect(azul.metadata.color_hex).toBe("#1E5AA8");
    const t = texts();
    t[CORREA_FILES.products] = t[CORREA_FILES.products]!.replace(",Azul,#1E5AA8,", ",Azul,azul,");
    expect(readCorreaSheets(t).errors.map((e) => e.column)).toContain("color_hex");
  });

  it("handle reservado por la página de grupo (E-2c)", () => {
    const t = texts();
    t[CORREA_FILES.products] = t[CORREA_FILES.products]!.replace(
      "correa-azul-nylon,",
      "correa-a-medida,",
    );
    expect(readCorreaSheets(t).errors.map((e) => e.message)).toContain(
      "Está reservado por la tienda.",
    );
  });
});

describe("correas: plan", () => {
  const wanted = () => buildWanted(sheets());
  const pieces = (w: ReturnType<typeof buildWanted>) =>
    w.pieces.map((p) => ({ id: `id:${p.sku}`, sku: p.sku, title: p.title, unit: p.unit }));

  it("vacío → crea todo; tras crear → nada que hacer (idempotente)", () => {
    const w = wanted();
    const first = planCorreas(w, {
      pieces: [],
      products: [],
      categoryId: "cat",
      skuOwners: new Map(),
    });
    expect(first.errors).toEqual([]);
    expect(first.pieces.create).toHaveLength(w.pieces.length);
    expect(first.products.create).toHaveLength(6);
    const again = planCorreas(w, {
      pieces: pieces(w),
      products: w.products.map((p) => asDb(p, "cat")),
      categoryId: "cat",
      skuOwners: new Map(),
    });
    expect(again.errors).toEqual([]);
    expect(again.pieces).toEqual({ create: [], rename: [] });
    expect(again.products.update).toEqual([]);
    expect(again.products.unchanged).toBe(6);
  });

  it("precio, largo nuevo y kit cambiados", () => {
    const w = wanted();
    const db = w.products.map((p) => asDb(p, "cat"));
    const s = sheets();
    s.lengths = [...s.lengths, { m: 16, supplement: 14 }];
    s.products = s.products.map((p) =>
      p.handle === "correa-rojo-pvc" ? { ...p, basePrice: 26 } : p,
    );
    s.parts = s.parts.map((p) => (p.sku === "PIEZA-ANILLA" ? { ...p, perCorrea: 2 } : p));
    const plan = planCorreas(buildWanted(s), {
      pieces: pieces(w),
      products: db,
      categoryId: "cat",
      skuOwners: new Map(),
    });
    const rojo = plan.products.update.find((u) => u.db.handle === "correa-rojo-pvc")!;
    expect(rojo.addValues).toEqual([{ optionId: "opt_0", title: OPTION_LENGTH, values: ["16 m"] }]);
    expect(rojo.create).toHaveLength(9);
    expect(rojo.remove).toEqual([]);
    expect(rojo.update).toHaveLength(117);
    expect(rojo.update[0]!.changes).toEqual(["precio", "kit"]);
    const azul = plan.products.update.find((u) => u.db.handle === "correa-azul-nylon")!;
    expect(azul.update[0]!.changes).toEqual(["kit"]);
  });

  it("sin categoría o con SKU de otro producto → error", () => {
    const plan = planCorreas(wanted(), {
      pieces: [],
      products: [],
      categoryId: null,
      skuOwners: new Map([["CORREA-ROJO-PVC-03-EST-EST", "otro"]]),
    });
    expect(plan.errors).toEqual([
      expect.stringMatching(/No existe la categoría «correas-perro»/),
      expect.stringMatching(/CORREA-ROJO-PVC-03-EST-EST ya es de otro producto \(otro\)/),
    ]);
  });
});

describe("correas: metadata de la línea", () => {
  it("solo correas, solo observaciones y medida exacta en su tramo", () => {
    expect(lineMetadataError(undefined, false, null)).toBeNull();
    expect(lineMetadataError({}, false, null)).toBeNull();
    expect(lineMetadataError({ observaciones: "x" }, false, null)).toMatch(/no admite/);
    expect(
      lineMetadataError({ observaciones: "Nombre: Hiro", medida_cm: 650 }, true, 7),
    ).toBeNull();
    expect(lineMetadataError({ observaciones: "x".repeat(201) }, true, 7)).toMatch(/200/);
    expect(lineMetadataError({ observaciones: "a\u0007b" }, true, 7)).toMatch(/no válidos/);
    expect(lineMetadataError({ observaciones: "línea 1\nlínea 2" }, true, 7)).toBeNull();
    expect(lineMetadataError({ otra: 1 }, true, 7)).toMatch(/no válidos/);
    expect(exactRange(7)).toEqual({ minCm: 601, maxCm: 700 });
    expect(lineMetadataError({ medida_cm: 601 }, true, 7)).toBeNull();
    expect(lineMetadataError({ medida_cm: 600 }, true, 7)).toMatch(/de 6,01 a 7 m/);
    expect(lineMetadataError({ medida_cm: 6.5 }, true, 7)).toMatch(/no es válida/);
  });
});

describe("demanda conjunta de piezas (E-2a: sobreventa entre líneas)", () => {
  const links = [
    { variant_id: "v7", inventory_item_id: "cuerda", required_quantity: 7.5 },
    { variant_id: "v7", inventory_item_id: "mon", required_quantity: 1 },
    { variant_id: "v5", inventory_item_id: "cuerda", required_quantity: 5.5 },
    { variant_id: "v5", inventory_item_id: "mon", required_quantity: 1 },
    { variant_id: "lata", inventory_item_id: "lata", required_quantity: 1 },
  ];

  it("suma solo las piezas que piden ≥ 2 líneas", () => {
    const d = sharedDemand(
      [
        { variant_id: "v7", quantity: 1 },
        { variant_id: "v7", quantity: 1 },
        { variant_id: "lata", quantity: 4 },
      ],
      links,
    );
    expect(d).toEqual(
      new Map([
        ["cuerda", 15],
        ["mon", 2],
      ]),
    );
    expect(
      shortages(
        d,
        new Map([
          ["cuerda", 9],
          ["mon", 2],
        ]),
      ),
    ).toEqual(["cuerda"]);
    expect(
      shortages(
        d,
        new Map([
          ["cuerda", 15],
          ["mon", 2],
        ]),
      ),
    ).toEqual([]);
  });

  it("variantes distintas que comparten mosquetón", () => {
    const d = sharedDemand(
      [
        { variant_id: "v7", quantity: 1 },
        { variant_id: "v5", quantity: 1 },
      ],
      links,
    );
    expect(
      shortages(
        d,
        new Map([
          ["cuerda", 20],
          ["mon", 1],
        ]),
      ),
    ).toEqual(["mon"]);
  });

  it("unidades por variante y máscaras de disponibilidad", () => {
    const units = variantUnits(
      links,
      new Map([
        ["cuerda", 8],
        ["mon", 3],
        ["lata", 0],
      ]),
    );
    expect(units).toEqual(
      new Map([
        ["v7", 1],
        ["v5", 1],
        ["lata", 0],
      ]),
    );
    const meta = (m: number, dog: string, hand: string) => ({
      largo_m: m,
      mosqueton_perro: dog,
      mosqueton_mano: hand,
    });
    const variants = [
      { id: "a", metadata: meta(3, "EST", "EST") },
      { id: "b", metadata: meta(3, "EST", "MON") },
      { id: "c", metadata: meta(3, "MON", "EST") },
      { id: "d", metadata: meta(3, "MON", "MON") },
      { id: "e", metadata: meta(9, "EST", "EST") },
    ];
    const av = availabilityOf(
      "x",
      variants,
      new Map([
        ["a", 2],
        ["b", 1],
        ["c", 0],
        ["d", 1],
        ["e", 0],
      ]),
    );
    // orden EST, MON: bit = perro × 2 + mano
    expect(av).toEqual({ handle: "x", max_m: 3, masks: { 3: 0b1011, 9: 0 } });
  });
});
