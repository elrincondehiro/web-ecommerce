import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { parseCsv } from "./csv.ts";
import {
  DEFAULT_OPTIONS,
  GROUP_OPTION,
  convert,
  parseNet,
  proposeCategory,
  slugify,
  uniqueHandle,
} from "./medusa.ts";
import type { Item } from "./types.ts";

const item = (id: string, name: string, opts: [string, string[]][] = []): Item => ({
  id,
  item_name: name,
  option1_name: opts[0]?.[0] ?? null,
  option2_name: opts[1]?.[0] ?? null,
  variants: (opts.length ? opts[0]![1] : ["x"]).map((v, i) => ({
    variant_id: `${id}-${i}`,
    item_id: id,
    sku: `${id}${i}`,
    option1_value: opts.length ? v : null,
    option2_value: opts[1]?.[1][i] ?? null,
  })),
});

const row = (it: Item, i: number, extra: Record<string, string> = {}) => ({
  decision: "sí",
  categoria: "Arneses/Collares",
  categoria_loyverse: "Arneses/Collares",
  articulo: it.item_name,
  articulo_loyverse: it.item_name,
  sku: it.variants[i]!.sku!,
  codigo_barras: "",
  precio: "12.5",
  iva: "21",
  item_id: it.id,
  variant_id: it.variants[i]!.variant_id,
  nombre_nuevo: "",
  categoria_nueva: "",
  ...extra,
});

const maps = () => ({
  options: new Map(Object.entries(DEFAULT_OPTIONS)),
  categories: new Map([
    ["arneses/collares", "paseo-perro"],
    ["comida humeda", "comida-humeda-perro"],
  ]),
  handles: new Map<string, string>(),
});

describe("conversión a catalog:import", () => {
  it("handles: minúsculas, sin tildes, únicos y no reservados", () => {
    assert.equal(slugify("Arnés Ñandú & Co. 2,5 kg"), "arnes-nandu-y-co-2-5-kg");
    const taken = new Set(["collar"]);
    assert.equal(uniqueHandle("collar", taken), "collar-2");
    assert.equal(uniqueHandle("correa-a-medida", new Set()), "correa-a-medida-2");
  });

  it("contenido neto desde el texto", () => {
    assert.deepEqual(parseNet("Lata 400gr"), { g: 400 });
    assert.deepEqual(parseNet("Saco 2,5 kg"), { g: 2500 });
    assert.deepEqual(parseNet("Champú 250 ml"), { ml: 250 });
    assert.deepEqual(parseNet("Aceite 1L"), { ml: 1000 });
    assert.equal(parseNet("Talla L 69-81cm"), null);
  });

  it("variantes con opciones mapeadas (talla/Talla → Talla), datos del producto en la 1.ª fila", () => {
    const a = item("a", "Arnés julius", [
      ["Talla", ["S", "M"]],
      ["color", ["Rojo", "Azul"]],
    ]);
    const r = convert([row(a, 0), row(a, 1)], new Map([["a", a]]), maps());
    assert.deepEqual(r.unmappedOptions, []);
    assert.equal(r.rows.length, 2);
    assert.deepEqual(
      [
        r.rows[0]!.handle,
        r.rows[0]!.titulo,
        r.rows[0]!.categorias,
        r.rows[0]!.iva,
        r.rows[0]!.estado,
      ],
      ["arnes-julius", "Arnés julius", "paseo-perro", "general", "publicado"],
    );
    assert.equal(r.rows[1]!.titulo, "");
    assert.equal(r.rows[1]!["opcion:Talla"], "M");
    assert.equal(r.rows[1]!["opcion:Color"], "Azul");
    assert.equal(r.rows[0]!.precio, "12,50");
    assert.equal(r.rows[0]!.stock, "0");
    assert.ok(r.columns.indexOf("opcion:Talla") > r.columns.indexOf("ean"));
  });

  it("agrupa artículos con el mismo nombre_nuevo; si las opciones no los distinguen, «Formato»", () => {
    const a = item("a", "Lata pollo 400g");
    const b = item("b", "Lata pollo 800g");
    const r = convert(
      [row(a, 0, { nombre_nuevo: "Lata de pollo" }), row(b, 0, { nombre_nuevo: "Lata de pollo" })],
      new Map([
        ["a", a],
        ["b", b],
      ]),
      maps(),
    );
    assert.equal(new Set(r.rows.map((x) => x.handle)).size, 1);
    assert.deepEqual(
      r.rows.map((x) => [x[`opcion:${GROUP_OPTION}`], x.neto_g]),
      [
        ["Lata pollo 400g", "400"],
        ["Lata pollo 800g", "800"],
      ],
    );
    assert.ok(r.warnings.some((w) => /Agrupa 2 artículos/.test(w.aviso)));
  });

  it("respeta el handle corregido, categoria_nueva y avisa de opciones y categorías sin mapa", () => {
    const a = item("a", "Collar", [["menu", ["Uno"]]]);
    const m = maps();
    m.handles.set("item:a", "collar-hiro");
    m.options.delete("menu");
    const r = convert(
      [row(a, 0, { categoria_nueva: "ropa-perro|paseo-perro", categoria_loyverse: "Ropa" })],
      new Map([["a", a]]),
      m,
    );
    assert.equal(r.rows[0]!.handle, "collar-hiro");
    assert.equal(r.rows[0]!.categorias, "ropa-perro|paseo-perro");
    assert.deepEqual(r.unmappedOptions, ["menu"]);
    const r2 = convert([row(a, 0, { categoria_loyverse: "Navidad" })], new Map([["a", a]]), maps());
    assert.deepEqual(r2.unmappedCategories, ["Navidad"]);
  });

  it("propuesta de categoría con el árbol nuevo", () => {
    const tree = [
      { handle: "perro", nombre: "Perro", padre: "" },
      { handle: "paseo-perro", nombre: "Paseo", padre: "perro" },
      { handle: "piensos-perro", nombre: "Piensos", padre: "perro" },
    ];
    assert.equal(proposeCategory("Arneses/Collares", tree), "paseo-perro");
    assert.equal(proposeCategory("Pienso", tree), "piensos-perro");
    assert.equal(proposeCategory("Cosa rara", tree), "");
  });

  it("CSV con filas de comentario «#» (plantillas del importador)", () => {
    const t = parseCsv('"# instrucciones, con coma"\n# otra\nhandle;nombre\nperro;Perro\n', {
      comments: true,
    });
    assert.deepEqual(t.columns, ["handle", "nombre"]);
    assert.deepEqual(t.rows, [{ handle: "perro", nombre: "Perro" }]);
  });
});
