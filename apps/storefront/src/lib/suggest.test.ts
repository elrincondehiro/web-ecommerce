import { describe, expect, it } from "vitest";
import { parseSearchParams, toSearchString } from "./search";
import { buildSuggestQuery, normalizeSuggestQuery, parseSuggestions } from "./suggest";

describe("normalizeSuggestQuery", () => {
  it("minúsculas, espacios simples y sin controles", () => {
    expect(normalizeSuggestQuery("  Bufanda\t  ROJA\u0000 ")).toBe("bufanda roja");
  });
  it("menos de 2 caracteres → null", () => {
    expect(normalizeSuggestQuery("a")).toBeNull();
    expect(normalizeSuggestQuery("   ")).toBeNull();
    expect(normalizeSuggestQuery(null)).toBeNull();
  });
  it("corta a 50 caracteres", () => {
    expect(normalizeSuggestQuery("x".repeat(80))).toHaveLength(50);
  });
});

describe("buildSuggestQuery", () => {
  it("6 productos, solo id/título/handle y la faceta de categorías", () => {
    const body = buildSuggestQuery("bufn");
    expect(body.filters).toEqual({ q: "bufn" });
    expect(body.pagination).toEqual({ skip: 0, take: 6 });
    expect(body.fields).toEqual(["id", "title", "handle"]);
    expect(body.search_options).toEqual({ facets: ["category_handles"] });
  });
});

describe("parseSuggestions", () => {
  const names = new Map([
    ["accesorios", "Accesorios"],
    ["ropa", "Ropa"],
    ["hogar", "Hogar"],
  ]);
  const result = {
    hits: [
      { id: "p1", document: { title: "Bufanda Roja", handle: "bufanda-roja" } },
      { id: "p2", document: { title: "Sin handle" } },
    ],
    facets: {
      category_handles: {
        values: [
          { value: "ropa", count: 3 },
          { value: "accesorios", count: 9 },
          { value: "hogar", count: 1 },
          { value: "oculta", count: 20 },
        ],
      },
    },
  };

  it("productos con enlace a la ficha; descarta los incompletos", () => {
    const s = parseSuggestions("bufn", result, names);
    expect(s.products).toEqual([{ title: "Bufanda Roja", href: "/producto/bufanda-roja/" }]);
  });
  it("hasta 2 categorías conocidas, de más a menos resultados, con URL canónica", () => {
    const s = parseSuggestions("buf roja", result, names);
    expect(s.categories.map((c) => c.name)).toEqual(["Accesorios", "Ropa"]);
    const href = s.categories[0]!.href;
    const qs = href.split("?")[1]!;
    expect(toSearchString(parseSearchParams(new URLSearchParams(qs)))).toBe(qs);
    expect(s.all).toBe("/buscar/?q=buf+roja");
  });
  it("sin resultado → listas vacías", () => {
    expect(parseSuggestions("zz", undefined, names)).toEqual({
      q: "zz",
      products: [],
      categories: [],
      all: "/buscar/?q=zz",
    });
  });
});
