import { describe, expect, it } from "vitest";
import { offerPageKey, offerPages, offerPagesManifest } from "./offer-pages";

const ids = Array.from({ length: 50 }, (_, i) => `prod_${String(i).padStart(3, "0")}`);

describe("offerPages", () => {
  it("parte en páginas de 24 (como paginate) con su clave", () => {
    const pages = offerPages(ids);
    expect(pages.map((p) => p.ids.length)).toEqual([24, 24, 2]);
    expect(pages[0]!.ids[0]).toBe("prod_000");
    expect(pages[2]!.ids).toEqual(["prod_048", "prod_049"]);
    for (const p of pages) expect(p.key).toMatch(/^[0-9a-f]{12}$/);
  });

  it("clave estable y distinta si cambia el contenido o el orden", () => {
    expect(offerPageKey(["a", "b"])).toBe(offerPageKey(["a", "b"]));
    expect(offerPageKey(["a", "b"])).not.toBe(offerPageKey(["b", "a"]));
    expect(offerPageKey(["a", "b"])).not.toBe(offerPageKey(["a", "c"]));
  });

  it("manifiesto clave → ids; vacío sin ofertas", () => {
    const m = offerPagesManifest(ids);
    expect(Object.keys(m)).toHaveLength(3);
    expect(Object.values(m).flat()).toEqual(ids);
    expect(offerPagesManifest([])).toEqual({});
  });
});
