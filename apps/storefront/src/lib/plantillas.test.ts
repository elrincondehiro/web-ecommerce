import { describe, expect, it } from "vitest";
import { resolveSizeGuide, resolveTemplate } from "./plantillas";

const node = (handle: string) => ({ handle });
const category = (...handles: string[]) => ({ path: handles.map(node) }) as never;
const templates = [
  { id: "arnes", categorias: ["arneses-perro"] },
  { id: "paseo", categorias: ["paseo-perro"] },
];
const p = (metadata: Record<string, unknown> = {}) => ({ handle: "x", metadata });

describe("resolveTemplate", () => {
  it("por categoría: la más concreta gana; sin categoría ni metadata, ninguna", () => {
    expect(resolveTemplate(p(), category("perro", "paseo-perro", "arneses-perro"), templates)).toBe(
      "arnes",
    );
    expect(
      resolveTemplate(p(), category("perro", "paseo-perro", "collares-perro"), templates),
    ).toBe("paseo");
    expect(resolveTemplate(p(), null, templates)).toBeNull();
  });
  it("metadata.plantilla manda; la correa no cuenta; una que no existe rompe el build", () => {
    expect(resolveTemplate(p({ plantilla: "paseo" }), category("arneses-perro"), templates)).toBe(
      "paseo",
    );
    expect(resolveTemplate(p({ plantilla: "correa" }), category("arneses-perro"), templates)).toBe(
      null,
    );
    expect(() => resolveTemplate(p({ plantilla: "otra" }), null, templates)).toThrow(/no existe/);
  });
});

describe("resolveSizeGuide", () => {
  it("la de la metadata, ninguna o error si no existe", () => {
    expect(resolveSizeGuide(p({ guia_tallas: "m-a" }), ["m-a"])).toBe("m-a");
    expect(resolveSizeGuide(p(), ["m-a"])).toBeNull();
    expect(() => resolveSizeGuide(p({ guia_tallas: "m-b" }), ["m-a"])).toThrow(/no existe/);
  });
});
