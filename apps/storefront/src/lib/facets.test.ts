import { describe, expect, it } from "vitest";
import type { StoreProduct } from "./catalog";
import {
  buildListingFacets,
  compareValues,
  facetsFromSearch,
  hiddenOptionTitles,
  isFilterableOption,
} from "./facets";

const product = (
  id: string,
  o: {
    cat?: string;
    tags?: string[];
    options?: Record<string, string[]>;
    prices?: number[];
    stock?: number;
    metadata?: Record<string, unknown>;
  },
) =>
  ({
    id,
    metadata: o.metadata ?? {},
    categories: o.cat ? [{ id: `c-${o.cat}`, handle: o.cat }] : [],
    tags: (o.tags ?? []).map((value) => ({ value })),
    options: Object.entries(o.options ?? {}).map(([title, values]) => ({
      title,
      values: values.map((value) => ({ value })),
    })),
    variants: (o.prices ?? [10]).map((amount, i) => ({
      id: `${id}-${i}`,
      manage_inventory: true,
      inventory_quantity: o.stock ?? 1,
      calculated_price: { calculated_amount_with_tax: amount, currency_code: "eur" },
    })),
  }) as unknown as StoreProduct;

describe("opciones no filtrables (Fase O)", () => {
  const withMeta = (id: string, metadata: Record<string, unknown> | null) =>
    ({
      ...product(id, { options: { "Mosquetón lado perro": ["Estándar", "Montaña"] } }),
      options: [
        {
          title: "Mosquetón lado perro",
          metadata,
          values: [{ value: "Estándar" }, { value: "Montaña" }],
        },
      ],
    }) as unknown as StoreProduct;

  it('metadata.filtrable = false (o "false" / "no" del Admin) la quita', () => {
    for (const v of [false, "false", "no"]) {
      expect(isFilterableOption({ metadata: { filtrable: v } })).toBe(false);
      expect(buildListingFacets([withMeta("a", { filtrable: v })]).groups).toEqual([]);
    }
    expect(isFilterableOption({ metadata: null })).toBe(true);
    expect(buildListingFacets([withMeta("a", null)]).groups).toHaveLength(1);
    expect([...hiddenOptionTitles([withMeta("a", { filtrable: false })])]).toEqual([
      "Mosquetón lado perro",
    ]);
  });
});

describe("compareValues", () => {
  it("tallas en orden natural, el resto alfabético con números", () => {
    expect(["XL", "S", "M", "L"].sort(compareValues)).toEqual(["S", "M", "L", "XL"]);
    expect(["500 g", "250 g", "1 kg"].sort(compareValues)).toEqual(["1 kg", "250 g", "500 g"]);
  });
});

describe("buildListingFacets", () => {
  const products = [
    product("a", {
      cat: "ropa",
      tags: ["vegano", "oferta"],
      options: { Talla: ["S", "M"], Formato: ["Único A"] },
      prices: [5, 9.5],
    }),
    product("b", {
      cat: "ropa",
      tags: ["vegano"],
      options: { Talla: ["M", "L"], Formato: ["Único B"] },
      prices: [20],
      stock: 0,
    }),
    product("c", { cat: "hogar", options: { Talla: ["M"] }, prices: [12] }),
  ];

  it("opciones: basta un producto, pero el grupo necesita ≥ 2 valores; etiquetas: ≥ 2 productos", () => {
    const f = buildListingFacets(products);
    expect(f.groups).toEqual([
      {
        key: "opcion",
        title: "Formato",
        values: [
          { value: "Formato:Único A", label: "Único A" },
          { value: "Formato:Único B", label: "Único B" },
        ],
      },
      {
        key: "opcion",
        title: "Talla",
        values: ["S", "M", "L"].map((v) => ({ value: `Talla:${v}`, label: v })),
      },
      { key: "etiqueta", title: "Etiquetas", values: [{ value: "vegano", label: "vegano" }] },
    ]);
    // Un solo valor en todo el listado («Formato: Única»): sin grupo
    const single = buildListingFacets([
      product("x", { options: { Formato: ["Única"] } }),
      product("y", { options: { Formato: ["Única"] } }),
    ]);
    expect(single.groups).toEqual([]);
    expect(f.price).toEqual({ min: 5, max: 20 });
    expect(f.stockFilter).toBe(true);
  });

  it("categorías solo si el listado las mezcla, en el orden del árbol (el del Map)", () => {
    const f = buildListingFacets(products, {
      categories: new Map([
        ["ropa", "Ropa"],
        ["hogar", "Hogar"],
      ]),
    });
    expect(f.groups[0]).toEqual({
      key: "categoria",
      title: "Categoría",
      values: [
        { value: "ropa", label: "Ropa" },
        { value: "hogar", label: "Hogar" },
      ],
    });
  });

  it("categoryHandles: cuenta también los ancestros (subcategorías)", () => {
    const f = buildListingFacets(products, {
      categories: new Map([
        ["perro", "Perro"],
        ["gato", "Gato"],
      ]),
      categoryHandles: (p) => (p.id === "c" ? ["gato", "juguetes-gato"] : ["perro", "ropa"]),
    });
    expect(f.groups[0]?.values).toEqual([
      { value: "perro", label: "Perro" },
      { value: "gato", label: "Gato" },
    ]);
  });

  it("todo con stock o un único precio → sin esos filtros", () => {
    const f = buildListingFacets([product("x", { prices: [3] }), product("y", { prices: [3] })]);
    expect(f.price).toBeNull();
    expect(f.stockFilter).toBe(false);
  });
});

describe("materia seca (S-2)", () => {
  it("rango entero de proteína/grasa s.m. entre los productos con humedad", () => {
    const f = buildListingFacets([
      product("p", { metadata: { proteina_pct: 25, grasa_pct: 15, humedad_pct: 9 } }), // 27,5 · 16,5
      product("l", { metadata: { proteina_pct: 9, grasa_pct: 7, humedad_pct: 75 } }), // 36 · 28
      product("s", { metadata: { proteina_pct: 50 } }), // sin humedad: no cuenta
      product("x", {}),
    ]);
    expect(f.ms).toEqual({ proteina: { min: 27, max: 36 }, grasa: { min: 16, max: 28 } });
  });
  it("un solo producto con el dato → sin filtro en los listados", () => {
    const f = buildListingFacets([
      product("p", { metadata: { proteina_pct: 25, humedad_pct: 9 } }),
      product("x", {}),
    ]);
    expect(f.ms).toEqual({});
  });
});

describe("facetsFromSearch", () => {
  it("grupo de opciones con un solo valor: fuera, salvo marcado (Fase F)", () => {
    const base = {
      categoria: [],
      etiqueta: [],
      opcion: [
        { value: "Formato:Única", count: 24 },
        { value: "Talla:S", count: 2 },
        { value: "Talla:M", count: 1 },
      ],
      disponible: 0,
      price: null,
    };
    const opts = { categories: new Map(), selected: new Set<string>(), total: 24 };
    expect(facetsFromSearch(base, opts).groups.map((g) => g.title)).toEqual(["Talla"]);
    const marked = facetsFromSearch(base, { ...opts, selected: new Set(["Formato:Única"]) });
    expect(marked.groups.map((g) => g.title)).toEqual(["Formato", "Talla"]);
  });

  it("agrupa opciones por título y conserva lo marcado aunque cuente 0", () => {
    const f = facetsFromSearch(
      {
        categoria: [
          { value: "ropa", count: 3 },
          { value: "desconocida", count: 1 },
        ],
        etiqueta: [{ value: "oferta", count: 0 }],
        opcion: [
          { value: "Talla:XL", count: 1 },
          { value: "Talla:S", count: 2 },
          { value: "Color:Rojo", count: 0 },
        ],
        disponible: 3,
        price: { min: 4.95, max: 61.95 },
      },
      { categories: new Map([["ropa", "Ropa"]]), selected: new Set(["Color:Rojo"]), total: 3 },
    );
    expect(f.groups.map((g) => [g.title, g.values.map((v) => v.label)])).toEqual([
      ["Categoría", ["Ropa"]],
      ["Color", ["Rojo"]],
      ["Talla", ["S", "XL"]],
    ]);
    expect(f.price).toEqual({ min: 4, max: 62 });
    expect(f.stockFilter).toBe(false);
  });
});

describe("familias (Fase FO)", () => {
  const COLOR = {
    familias: [
      { id: "verde", nombre: "Verde", color: "#3f9a55" },
      { id: "azul", nombre: "Azul", color: "#2f6fd1" },
      { id: "multicolor", nombre: "Multicolor" },
    ],
  };
  const TALLA = {
    familias: [
      { id: "s", nombre: "S" },
      { id: "m", nombre: "M" },
    ],
  };
  /** Producto con opciones con metadata (de opción y de valor). */
  const withFamilies = (
    id: string,
    color: [string, string[]][],
    talla: [string, string[]][] = [],
    stock = 1,
  ) =>
    ({
      ...product(id, { stock }),
      options: [
        {
          title: "Color",
          metadata: COLOR,
          values: color.map(([value, familias]) => ({ value, metadata: { familias } })),
        },
        ...(talla.length
          ? [
              {
                title: "Talla",
                metadata: TALLA,
                values: talla.map(([value, familias]) => ({ value, metadata: { familias } })),
              },
            ]
          : []),
      ],
    }) as unknown as StoreProduct;

  it("build: grupo por familias (orden de la opción, con color) en vez de por valores", () => {
    const f = buildListingFacets([
      withFamilies("a", [
        ["Sea Foam", ["verde", "azul"]],
        ["Huckleberry", []],
      ]),
      withFamilies("b", [["Deep Teal", ["azul"]]], [["35–45 cm", ["s", "m"]]]),
      withFamilies("c", [["Lime Mix", ["multicolor"]]], [["50 cm", ["m"]]]),
    ]);
    const color = f.groups.find((g) => g.title === "Color")!;
    expect(color.key).toBe("familia");
    expect(color.values).toEqual([
      { value: "Color:verde", label: "Verde", color: "#3f9a55", count: undefined },
      { value: "Color:azul", label: "Azul", color: "#2f6fd1", count: undefined },
      { value: "Color:multicolor", label: "Multicolor", color: null, count: undefined },
    ]);
    // Tallas: familias sin colores → sin punto
    const talla = f.groups.find((g) => g.title === "Talla")!;
    expect(talla.values.map((v) => [v.value, v.color])).toEqual([
      ["Talla:s", undefined],
      ["Talla:m", undefined],
    ]);
    // Los nombres de marca no aparecen como filtros
    expect(JSON.stringify(f.groups)).not.toContain("Sea Foam");
  });

  it("build: una sola familia con productos no filtra nada (no sale el grupo)", () => {
    const f = buildListingFacets([
      withFamilies("a", [["Deep Teal", ["azul"]]]),
      withFamilies("b", [["Pacific Blue", ["azul"]]]),
    ]);
    expect(f.groups).toEqual([]);
  });

  it("/buscar/: familias con recuentos, en el orden de la opción; los valores de esa opción no salen", () => {
    const f = facetsFromSearch(
      {
        categoria: [],
        etiqueta: [],
        opcion: [
          { value: "Color:Sea Foam", count: 4 },
          { value: "Tamaño:3 kg", count: 2 },
          { value: "Tamaño:12 kg", count: 1 },
        ],
        familia: [
          { value: "Color:azul", count: 6 },
          { value: "Color:verde", count: 4 },
        ],
        disponible: 0,
        price: null,
      },
      {
        categories: new Map(),
        families: new Map([["Color", COLOR.familias.map((x) => ({ color: null, ...x }))]]),
        selected: new Set(["Color:multicolor"]),
        total: 10,
      },
    );
    expect(f.groups.map((g) => [g.key, g.title])).toEqual([
      ["familia", "Color"],
      ["opcion", "Tamaño"],
    ]);
    // «Multicolor» marcado sin resultados: se queda (para poder desmarcarlo), con 0
    expect(f.groups[0]!.values.map((v) => [v.label, v.count])).toEqual([
      ["Verde", 4],
      ["Azul", 6],
      ["Multicolor", 0],
    ]);
  });
});
