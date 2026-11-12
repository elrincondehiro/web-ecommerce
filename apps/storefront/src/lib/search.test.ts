import { describe, expect, it } from "vitest";
import {
  isPlainSearch,
  splitUtm,
  withUtm,
  activeFilters,
  buildSearchQueries,
  clearFiltersUrl,
  hasFilters,
  lastPage,
  parseSearchParams,
  parseSearchResults,
  searchUrl,
  selectedCount,
  toSearchString,
  toggleUrl,
  type RawSearchResult,
} from "./search";

const parse = (qs: string) => parseSearchParams(new URLSearchParams(qs));

describe("parseSearchParams", () => {
  it("valores por defecto", () => {
    expect(parse("")).toEqual({
      q: "",
      categoria: [],
      etiqueta: [],
      opcion: [],
      familia: [],
      precioMin: null,
      precioMax: null,
      disponible: false,
      ms: { proteina: { min: null, max: null }, grasa: { min: null, max: null } },
      orden: "relevancia",
      pagina: 1,
      vista: "tarjetas",
    });
  });

  it("materia seca (S-2): % de 0 a 100 con un decimal, min/max ordenados y URL canónica", () => {
    const p = parse("grasa_max=10,25&proteina_min=40&proteina_max=30&grasa_min=-2");
    expect(p.ms).toEqual({ proteina: { min: 30, max: 40 }, grasa: { min: null, max: 10.3 } });
    expect(toSearchString(p)).toBe("proteina_min=30&proteina_max=40&grasa_max=10.3");
    expect(parse("proteina_min=120").ms.proteina.min).toBeNull();
  });

  it("normaliza: ordena, quita repetidos y descarta lo inválido", () => {
    const p = parse(
      "q=%20%20jersei%20%20rojo%20&categoria=ropa&categoria=hogar&categoria=ropa&categoria=NO%20VALIDA" +
        "&opcion=Talla:M&opcion=Color:Rojo&opcion=sin-dos-puntos&etiqueta=oferta" +
        "&orden=raro&pagina=-3&disponible=si",
    );
    expect(p.q).toBe("jersei rojo");
    expect(p.categoria).toEqual(["hogar", "ropa"]);
    expect(p.opcion).toEqual(["Color:Rojo", "Talla:M"]);
    expect(p.etiqueta).toEqual(["oferta"]);
    expect(p.orden).toBe("relevancia");
    expect(p.pagina).toBe(1);
    expect(p.disponible).toBe(false);
  });

  it("precios: coma decimal, negativos fuera y min/max intercambiados", () => {
    expect(parse("precio_min=12,5&precio_max=3")).toMatchObject({ precioMin: 3, precioMax: 12.5 });
    expect(parse("precio_min=-1&precio_max=abc")).toMatchObject({
      precioMin: null,
      precioMax: null,
    });
  });

  it("limita la longitud del texto y el número de página", () => {
    expect(parse(`q=${"a".repeat(300)}`).q).toHaveLength(100);
    expect(parse("pagina=9999").pagina).toBe(1);
    expect(parse("pagina=3").pagina).toBe(3);
  });
});

describe("URL canónica", () => {
  it("el mismo filtro en otro orden da la misma URL", () => {
    const a = toSearchString(parse("opcion=Talla:M&q=x&categoria=ropa&opcion=Color:Rojo"));
    const b = toSearchString(parse("categoria=ropa&opcion=Color:Rojo&opcion=Talla:M&q=x"));
    expect(a).toBe(b);
    expect(a).toBe("q=x&categoria=ropa&opcion=Color%3ARojo&opcion=Talla%3AM");
  });

  it("sin parámetros → /buscar/", () => {
    expect(searchUrl(parse(""))).toBe("/buscar/");
    expect(searchUrl(parse("q=a"), "/otra/")).toBe("/otra/?q=a");
  });
});

describe("toggleUrl, chips y quitar filtros", () => {
  const p = parse("q=jersei&opcion=Talla:M&disponible=1&precio_max=20&orden=novedades&pagina=3");

  it("marcar y desmarcar vuelve a la página 1 y conserva el orden", () => {
    expect(toggleUrl(p, "opcion", "Talla:L")).toBe(
      "/buscar/?q=jersei&opcion=Talla%3AL&opcion=Talla%3AM&precio_max=20&disponible=1&orden=novedades",
    );
    expect(toggleUrl(p, "opcion", "Talla:M")).toBe(
      "/buscar/?q=jersei&precio_max=20&disponible=1&orden=novedades",
    );
  });

  it("un chip por filtro, cada uno quita solo el suyo", () => {
    const chips = activeFilters(p);
    expect(chips.map((c) => c.label)).toEqual(["Talla: M", "Hasta 20 €", "Disponible"]);
    expect(chips[1]!.href).toBe("/buscar/?q=jersei&opcion=Talla%3AM&disponible=1&orden=novedades");
  });

  it("los filtros fijos (categoría del listado) no tienen chip ni se quitan", () => {
    const c = parse("categoria=ropa&categoria=hogar&opcion=Talla:M");
    const chips = activeFilters(c, { fixed: { categoria: "ropa" }, path: "/otra/" });
    expect(chips.map((x) => x.label)).toEqual(["hogar", "Talla: M"]);
    expect(clearFiltersUrl(c, "/otra/", { categoria: "ropa" })).toBe("/otra/?categoria=ropa");
    expect(hasFilters(parse("categoria=ropa"), { categoria: "ropa" })).toBe(false);
  });

  it("quitar todo mantiene el texto y el orden", () => {
    expect(clearFiltersUrl(p)).toBe("/buscar/?q=jersei&orden=novedades");
    expect(hasFilters(p)).toBe(true);
    expect(hasFilters(parse("q=a"))).toBe(false);
  });
});

describe("buildSearchQueries", () => {
  it("sin filtros: una consulta, sin typo_tolerance, orden por título", () => {
    const [main, ...rest] = buildSearchQueries(parse(""));
    expect(rest).toHaveLength(0);
    expect(main!.filters).toEqual({ $and: [{ discontinued: { $ne: true } }] });
    expect(main!.pagination).toEqual({ skip: 0, take: 24, order: { title: "ASC" } });
    expect(JSON.stringify(main)).not.toContain("typo_tolerance");
    expect(main!.search_options.disjunctive_facets).toBe(true);
  });

  it("con texto y relevancia no fija orden", () => {
    const [main] = buildSearchQueries(parse("q=lampara&pagina=2"));
    expect(main!.filters).toEqual({ q: "lampara", $and: [{ discontinued: { $ne: true } }] });
    expect(main!.pagination).toEqual({ skip: 24, take: 24 });
  });

  it("OR dentro de un grupo, AND entre grupos y rango de precio solapado", () => {
    const [main, ...rest] = buildSearchQueries(
      parse(
        "categoria=ropa&opcion=Talla:M&opcion=Talla:L&opcion=Color:Rojo&precio_min=5&precio_max=20&disponible=1&orden=precio-asc",
      ),
    );
    expect(main!.filters).toEqual({
      $and: [
        { discontinued: { $ne: true } },
        { category_tree_handles: { $in: ["ropa"] } },
        { option_values: { $in: ["Color:Rojo"] } },
        { option_values: { $in: ["Talla:L", "Talla:M"] } },
        { max_price_eur: { $gte: 5 } },
        { min_price_eur: { $lte: 20 } },
        { in_stock: true },
      ],
    });
    expect(main!.pagination.order).toEqual({ min_price_eur: "ASC" });
    expect(main!.search_options.facets).toContainEqual({ field: "proteina_ms", type: "stats" });
    // Con opciones marcadas, `option_values` no va en la principal (Medusa le quitaría el
    // filtro de TODAS las opciones): una con todos los filtros y una por grupo sin el suyo.
    expect(main!.search_options.facets).not.toContain("option_values");
    expect(rest).toHaveLength(3);
    expect(rest[0]!.filters).toEqual(main!.filters);
    expect(JSON.stringify(rest[1]!.filters)).not.toContain("Color:Rojo");
    expect(JSON.stringify(rest[1]!.filters)).toContain("Talla:M");
    expect(JSON.stringify(rest[2]!.filters)).not.toContain("Talla:M");
    expect(JSON.stringify(rest[2]!.filters)).toContain("Color:Rojo");
    expect(rest[2]!.pagination).toEqual({ skip: 0, take: 0 });
  });

  it("un solo grupo marcado: también se cuentan aparte los demás grupos (con el filtro)", () => {
    const [main, ...rest] = buildSearchQueries(parse("opcion=Color:Rojo&opcion=Color:Azul"));
    expect(main!.search_options.facets).not.toContain("option_values");
    expect(rest).toHaveLength(2);
    expect(JSON.stringify(rest[0]!.filters)).toContain("Color:Rojo");
    expect(JSON.stringify(rest[1]!.filters)).not.toContain("Color:");
  });

  it("sin opciones marcadas: una sola consulta, con option_values", () => {
    const queries = buildSearchQueries(parse("categoria=ropa"));
    expect(queries).toHaveLength(1);
    expect(queries[0]!.search_options.facets).toContain("option_values");
  });
});

describe("materia seca en la consulta (S-2)", () => {
  it("rango sobre proteina_ms / grasa_ms; chip y recuento", () => {
    const p = parse("proteina_min=30&grasa_max=12");
    const [main] = buildSearchQueries(p);
    expect(main!.filters).toEqual({
      $and: [
        { discontinued: { $ne: true } },
        { proteina_ms: { $gte: 30 } },
        { grasa_ms: { $lte: 12 } },
      ],
    });
    const chips = activeFilters(p);
    expect(chips.map((c) => c.label)).toEqual(["Proteína s.m.: ≥ 30 %", "Grasa s.m.: ≤ 12 %"]);
    expect(chips[0]!.href).toBe("/buscar/?grasa_max=12");
    expect(selectedCount(p)).toBe(2);
    expect(hasFilters(p)).toBe(true);
  });

  it("stats de materia seca en la respuesta", () => {
    const out = parseSearchResults(parse(""), [
      { hits: [], metadata: { count: 0 }, facets: { proteina_ms: { min: 22.5, max: 61 } } },
    ]);
    expect(out.facets.ms).toEqual({ proteina: { min: 22.5, max: 61 } });
  });

  it("sin datos (el proveedor da 0–0) no hay filtro, salvo que ya esté aplicado (Fase F)", () => {
    const zero = { proteina_ms: { min: 0, max: 0 }, grasa_ms: { min: 0, max: 0 } };
    const res = (facets: NonNullable<RawSearchResult["facets"]>): RawSearchResult[] => [
      { hits: [], metadata: { count: 3 }, facets },
    ];
    expect(parseSearchResults(parse(""), res(zero)).facets.ms).toEqual({});
    // Ya filtrado y queda un solo valor: se conserva para poder cambiarlo
    const one = { proteina_ms: { min: 30, max: 30 } };
    expect(parseSearchResults(parse("proteina_min=30"), res(one)).facets.ms).toEqual({
      proteina: { min: 30, max: 30 },
    });
  });
});

describe("rango de precio (Fase F)", () => {
  const res = (facets: NonNullable<RawSearchResult["facets"]>): RawSearchResult[] => [
    { hits: [], metadata: { count: 5 }, facets },
  ];
  it("del más barato de los mínimos al más caro de los máximos", () => {
    const out = parseSearchResults(
      parse("categoria=ropa-perro"),
      res({
        min_price_eur: { type: "stats", min: 17.95, max: 27.95 },
        max_price_eur: { type: "stats", min: 23.95, max: 35.95 },
      }),
    );
    expect(out.facets.price).toEqual({ min: 17.95, max: 35.95 });
  });
  it("pide las dos estadísticas al motor", () => {
    const [main] = buildSearchQueries(parse(""));
    expect(main!.search_options.facets).toEqual(
      expect.arrayContaining([
        { field: "min_price_eur", type: "stats" },
        { field: "max_price_eur", type: "stats" },
      ]),
    );
  });
  it("un solo precio: sin filtro, salvo que ya esté aplicado", () => {
    const one = {
      min_price_eur: { min: 9.95, max: 9.95 },
      max_price_eur: { min: 9.95, max: 9.95 },
    };
    expect(parseSearchResults(parse(""), res(one)).facets.price).toBeNull();
    expect(parseSearchResults(parse("precio_min=9"), res(one)).facets.price).toEqual({
      min: 9.95,
      max: 9.95,
    });
  });
});

describe("familias (Fase FO)", () => {
  it("parámetro `familia`: «Título:id» válido, ordenado y en la URL canónica", () => {
    const p = parse(
      "familia=Color:verde&familia=Color:Azul&familia=Talla:m&familia=sin&familia=Color:azul",
    );
    expect(p.familia).toEqual(["Color:azul", "Color:verde", "Talla:m"]);
    expect(toSearchString(p)).toBe("familia=Color%3Aazul&familia=Color%3Averde&familia=Talla%3Am");
    expect(hasFilters(p)).toBe(true);
    expect(selectedCount(p)).toBe(3);
  });

  it("filtro por option_families (OR en la opción, AND entre opciones) y recuentos aparte", () => {
    const [main, ...rest] = buildSearchQueries(
      parse("familia=Color:azul&familia=Color:verde&familia=Talla:m&opcion=Tamaño:3 kg"),
    );
    expect(main!.filters).toEqual({
      $and: [
        { discontinued: { $ne: true } },
        { option_values: { $in: ["Tamaño:3 kg"] } },
        { option_families: { $in: ["Color:azul", "Color:verde"] } },
        { option_families: { $in: ["Talla:m"] } },
      ],
    });
    expect(main!.search_options.facets).not.toContain("option_families");
    expect(main!.search_options.facets).not.toContain("option_values");
    // [1] con todo; un grupo por opción marcada (Tamaño, Color, Talla), cada uno sin el suyo
    expect(rest).toHaveLength(4);
    expect(rest[0]!.search_options.facets).toEqual(["option_values", "option_families"]);
    const withoutColor = JSON.stringify(rest[2]!.filters);
    expect(withoutColor).not.toContain("Color:azul");
    expect(withoutColor).toContain("Talla:m");
    expect(withoutColor).toContain("Tamaño:3 kg");
  });

  it("sin nada marcado: una consulta que pide la faceta option_families", () => {
    const [main, ...rest] = buildSearchQueries(parse(""));
    expect(rest).toHaveLength(0);
    expect(main!.search_options.facets).toContain("option_families");
  });

  it("parseSearchResults: recuentos de familias por grupo", () => {
    const p = parse("familia=Color:azul");
    const out = parseSearchResults(p, [
      { hits: [{ id: "a" }], metadata: { count: 1 }, facets: {} },
      {
        facets: {
          option_families: {
            values: [
              { value: "Color:azul", count: 1 },
              { value: "Talla:m", count: 1 },
            ],
          },
        },
      },
      {
        facets: {
          option_families: {
            values: [
              { value: "Color:azul", count: 3 },
              { value: "Color:verde", count: 2 },
              { value: "Talla:m", count: 7 },
            ],
          },
        },
      },
    ]);
    // Talla (no marcada) con todos los filtros; Color (marcada) sin su propio filtro
    expect(out.facets.familia).toEqual([
      { value: "Talla:m", count: 1 },
      { value: "Color:azul", count: 3 },
      { value: "Color:verde", count: 2 },
    ]);
  });

  it("chip con el nombre de la familia y enlace que la quita", () => {
    const p = parse("familia=Color:marron-beige&familia=Color:azul");
    const chips = activeFilters(p, {
      familia: (k) => ({ "Color:marron-beige": "Marrón y beige" })[k],
    });
    expect(chips.map((c) => c.label)).toEqual(["Color: azul", "Color: Marrón y beige"]);
    expect(chips[1]!.href).toBe("/buscar/?familia=Color%3Aazul");
  });
});

describe("parseSearchResults", () => {
  it("combina los recuentos de opciones de cada grupo", () => {
    const p = parse("opcion=Talla:M&opcion=Color:Rojo");
    const out = parseSearchResults(p, [
      {
        hits: [{ id: "a" }, { id: "b" }],
        metadata: { count: 2 },
        facets: {
          category_tree_handles: { values: [{ value: "ropa", count: 2 }] },
          in_stock: { values: [{ value: "true", count: 2 }] },
          min_price_eur: { type: "stats", min: 4.95, max: 20 },
        },
      },
      // Con todos los filtros: vale para los grupos NO marcados
      {
        facets: {
          option_values: {
            values: [
              { value: "Talla:M", count: 2 },
              { value: "Color:Rojo", count: 2 },
              { value: "Formato:Único", count: 1 },
            ],
          },
        },
      },
      {
        facets: {
          option_values: {
            values: [
              { value: "Talla:M", count: 5 },
              { value: "Talla:S", count: 3 },
              { value: "Color:Rojo", count: 1 },
            ],
          },
        },
      },
      {
        facets: {
          option_values: {
            values: [
              { value: "Color:Rojo", count: 4 },
              { value: "Talla:M", count: 9 },
            ],
          },
        },
      },
    ]);
    expect(out.ids).toEqual(["a", "b"]);
    expect(out.total).toBe(2);
    // Orden de grupos de optionGroups: Color (rest[0]) luego Talla (rest[1])
    expect(out.facets.opcion).toEqual([
      { value: "Formato:Único", count: 1 },
      { value: "Color:Rojo", count: 1 },
      { value: "Talla:M", count: 9 },
    ]);
    expect(out.facets.disponible).toBe(2);
    expect(out.facets.price).toEqual({ min: 4.95, max: 20 });
  });

  it("un grupo marcado: los demás grupos con sus números reales (lo que no da resultados, fuera)", () => {
    const p = parse("opcion=Color:Rojo&opcion=Color:Azul");
    const out = parseSearchResults(p, [
      // La principal no trae option_values (§ buildSearchQueries)
      { hits: [], metadata: { count: 101 }, facets: {} },
      // Con el filtro de color: Talla sí, Peso no (ningún producto rojo o azul tiene peso)
      {
        facets: {
          option_values: {
            values: [
              { value: "Talla:M", count: 101 },
              { value: "Color:Rojo", count: 68 },
            ],
          },
        },
      },
      // Sin el filtro de color: los colores para añadir otro (OR)
      {
        facets: {
          option_values: {
            values: [
              { value: "Color:Rojo", count: 68 },
              { value: "Color:Verde", count: 64 },
              { value: "Peso:3 kg", count: 128 },
            ],
          },
        },
      },
    ]);
    expect(out.facets.opcion).toEqual([
      { value: "Talla:M", count: 101 },
      { value: "Color:Rojo", count: 68 },
      { value: "Color:Verde", count: 64 },
    ]);
  });

  it("lastPage", () => {
    expect(lastPage(0)).toBe(1);
    expect(lastPage(25)).toBe(2);
    expect(lastPage(100000)).toBe(100);
  });
});

describe("vista tabla y orden por nutrientes (Fase MK-C)", () => {
  it("/buscar/?vista=tabla ↔ /comparar/ con los mismos filtros", async () => {
    const { canonicalQuery, parseResultsParams, searchUrl, viewUrl } = await import("./search");
    const q = new URLSearchParams("categoria=piensos-perro&proteina_min=30&orden=proteina");
    const buscar = parseResultsParams(q, "/buscar/");
    expect(buscar.vista).toBe("tarjetas");
    const comparar = parseResultsParams(q, "/comparar/");
    expect(comparar.vista).toBe("tabla");
    expect(viewUrl(buscar, "tabla")).toBe(
      "/comparar/?categoria=piensos-perro&proteina_min=30&orden=proteina",
    );
    expect(viewUrl(comparar, "tarjetas")).toBe(
      "/buscar/?categoria=piensos-perro&proteina_min=30&orden=proteina",
    );
    // En /comparar/ la vista no va en la URL; en /buscar/ sí (y la página redirige).
    expect(canonicalQuery(comparar, "/comparar/")).not.toContain("vista");
    expect(searchUrl({ ...buscar, vista: "tabla" })).toContain("vista=tabla");
  });

  it("orden por proteína y grasa sobre materia seca, de más a menos", async () => {
    const { buildSearchQueries, parseSearchParams } = await import("./search");
    const order = (o: string) =>
      buildSearchQueries(parseSearchParams(new URLSearchParams(`orden=${o}`)))[0]!.pagination.order;
    expect(order("proteina")).toEqual({ proteina_ms: "DESC" });
    expect(order("grasa")).toEqual({ grasa_ms: "ASC" });
  });

  it("vista tabla (/comparar/): solo productos con datos analíticos, también en las facetas", async () => {
    const { buildSearchQueries, parseResultsParams } = await import("./search");
    const q = new URLSearchParams("categoria=perro");
    const filters = (path: string) =>
      JSON.stringify(buildSearchQueries(parseResultsParams(q, path))[0]!.filters);
    expect(filters("/comparar/")).toContain('"has_analytics":true');
    expect(filters("/buscar/")).not.toContain("has_analytics");
  });
});

describe("estadísticas de búsquedas y campañas (Fase MK-E2)", () => {
  const p = (qs: string) => parseSearchParams(new URLSearchParams(qs));
  it("solo cuenta la búsqueda limpia", () => {
    expect(isPlainSearch(p("q=arnes"))).toBe(true);
    expect(isPlainSearch(p(""))).toBe(false);
    expect(isPlainSearch(p("q=arnes&pagina=2"))).toBe(false);
    expect(isPlainSearch(p("q=arnes&categoria=perro"))).toBe(false);
    expect(isPlainSearch(p("q=arnes&orden=precio-asc"))).toBe(false);
    expect(isPlainSearch(p("q=arnes&disponible=1"))).toBe(false);
  });
  it("aparta los utm_* y los vuelve a poner", () => {
    const { rest, utm } = splitUtm(
      new URLSearchParams("q=x&utm_source=news&pagina=1&utm_campaign=otono&utm_foo=1"),
    );
    expect(rest.toString()).toBe("q=x&pagina=1&utm_foo=1");
    expect(utm).toBe("utm_source=news&utm_campaign=otono");
    expect(withUtm("/buscar/?q=x", utm)).toBe("/buscar/?q=x&utm_source=news&utm_campaign=otono");
    expect(withUtm("/buscar/", "utm_source=a")).toBe("/buscar/?utm_source=a");
    expect(withUtm("/buscar/", "")).toBe("/buscar/");
  });
});
