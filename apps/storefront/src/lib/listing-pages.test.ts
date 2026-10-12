import { describe, expect, it } from "vitest";
import { listingPageKey, listingPages, listingPagesManifest } from "./listing-pages";

const ids = Array.from({ length: 50 }, (_, i) => `prod_${String(i).padStart(3, "0")}`);

describe("listingPages", () => {
  it("parte en páginas de 24 (como paginate) con su clave", () => {
    const pages = listingPages(ids);
    expect(pages.map((p) => p.ids.length)).toEqual([24, 24, 2]);
    expect(pages[0]!.ids[0]).toBe("prod_000");
    expect(pages[2]!.ids).toEqual(["prod_048", "prod_049"]);
    for (const p of pages) expect(p.key).toMatch(/^[0-9a-f]{12}$/);
  });

  it("clave estable y distinta si cambia el contenido o el orden", () => {
    expect(listingPageKey(["a", "b"])).toBe(listingPageKey(["a", "b"]));
    expect(listingPageKey(["a", "b"])).not.toBe(listingPageKey(["b", "a"]));
    expect(listingPageKey(["a", "b"])).not.toBe(listingPageKey(["a", "c"]));
  });

  it("manifiesto de varios listados; bloque sin paginar; vacío sin productos", () => {
    const m = listingPagesManifest([
      { ids },
      { ids: ids.slice(0, 30), size: Infinity },
      { ids: ids.slice(0, 24) }, // misma página que la 1.ª de `ids`: misma clave
    ]);
    expect(Object.keys(m)).toHaveLength(4);
    expect(m[listingPageKey(ids.slice(0, 30))]).toHaveLength(30);
    expect(listingPagesManifest([{ ids: [] }])).toEqual({});
  });
});
