import { describe, expect, it } from "vitest";
import {
  activeFilters,
  buildSearchQueries,
  clearFiltersUrl,
  hasFilters,
  lastPage,
  parseSearchParams,
  parseSearchResults,
  searchUrl,
  toSearchString,
  toggleUrl,
} from "./search";

const parse = (qs: string) => parseSearchParams(new URLSearchParams(qs));

describe("parseSearchParams", () => {
  it("valores por defecto", () => {
    expect(parse("")).toEqual({
      q: "",
      categoria: [],
      etiqueta: [],
      opcion: [],
      precioMin: null,
      precioMax: null,
      disponible: false,
      orden: "relevancia",
      pagina: 1,
    });
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
    expect(main!.filters).toEqual({});
    expect(main!.pagination).toEqual({ skip: 0, take: 24, order: { title: "ASC" } });
    expect(JSON.stringify(main)).not.toContain("typo_tolerance");
    expect(main!.search_options.disjunctive_facets).toBe(true);
  });

  it("con texto y relevancia no fija orden", () => {
    const [main] = buildSearchQueries(parse("q=lampara&pagina=2"));
    expect(main!.filters).toEqual({ q: "lampara" });
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
        { category_handles: { $in: ["ropa"] } },
        { option_values: { $in: ["Color:Rojo"] } },
        { option_values: { $in: ["Talla:L", "Talla:M"] } },
        { max_price_eur: { $gte: 5 } },
        { min_price_eur: { $lte: 20 } },
        { in_stock: true },
      ],
    });
    expect(main!.pagination.order).toEqual({ min_price_eur: "ASC" });
    // Una consulta extra por grupo de opciones, sin el propio grupo
    expect(rest).toHaveLength(2);
    expect(JSON.stringify(rest[0]!.filters)).not.toContain("Color:Rojo");
    expect(JSON.stringify(rest[0]!.filters)).toContain("Talla:M");
    expect(rest[1]!.pagination).toEqual({ skip: 0, take: 0 });
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
          category_handles: { values: [{ value: "ropa", count: 2 }] },
          option_values: {
            values: [
              { value: "Talla:M", count: 99 },
              { value: "Color:Rojo", count: 99 },
              { value: "Formato:Único", count: 1 },
            ],
          },
          in_stock: { values: [{ value: "true", count: 2 }] },
          min_price_eur: { type: "stats", min: 4.95, max: 20 },
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

  it("lastPage", () => {
    expect(lastPage(0)).toBe(1);
    expect(lastPage(25)).toBe(2);
    expect(lastPage(100000)).toBe(100);
  });
});
