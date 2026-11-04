import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  categoryDesignError,
  productDesign,
  resolveCategoryDesign,
  resolveProductDesign,
} from "./disenos";

const node = (handle: string, metadata: Record<string, unknown> | null = null) => ({
  handle,
  metadata,
});
const product = (metadata: Record<string, unknown> | null = null) => ({ handle: "p", metadata });

describe("diseño de la ficha (Fase DS)", () => {
  const path = [
    node("perros", { diseno_productos: "estandar" }),
    node("paseo-perro"),
    node("correas-perro"),
  ];

  it("sin nada → estándar", () => {
    expect(resolveProductDesign(product(), null)).toBe("estandar");
    expect(resolveProductDesign(product(), [node("a"), node("b")])).toBe("estandar");
  });

  it("el del producto manda; si no, el de la categoría más concreta y sus padres", () => {
    expect(resolveProductDesign(product({ diseno: "correa" }), path)).toBe("correa");
    expect(resolveProductDesign(product(), path)).toBe("estandar");
    const nearest = [node("a", { diseno_productos: "estandar" }), node("b", { diseno: "x" })];
    // `diseno` de una categoría es el de SU página: no se hereda (y aquí es un id inválido)
    expect(() => resolveProductDesign(product(), nearest)).toThrow(/Categoría «b»/);
  });

  it("la plantilla (Fase O) no decide el diseño", () => {
    expect(resolveProductDesign(product({ plantilla: "arnes" }), null)).toBe("estandar");
  });

  it("id desconocido → error de build con el producto y el valor", () => {
    expect(() => resolveProductDesign(product({ diseno: "otro" }), null)).toThrow(
      /Producto «p»: el diseño de ficha «otro» no existe/,
    );
  });

  it("una categoría no puede heredar un diseño de producto (correa)", () => {
    expect(categoryDesignError({ diseno_productos: "correa" })).toMatch(/no se hereda/);
    expect(() =>
      resolveProductDesign(product(), [node("c", { diseno_productos: "correa" })]),
    ).toThrow(/no se hereda/);
  });

  it("caja (Fase CS): diseño de producto con datos de línea; no se hereda", () => {
    expect(resolveProductDesign(product({ diseno: "caja" }), null)).toBe("caja");
    expect(productDesign(product({ diseno: "caja" }))).toMatchObject({
      configurable: true,
      datos_linea: "caja",
      selector: false,
      guias: false,
    });
    expect(categoryDesignError({ diseno_productos: "caja" })).toMatch(/no se hereda/);
    expect(productDesign(product({ diseno: "correa" })).datos_linea).toBe("correa");
    expect(productDesign(product()).datos_linea).toBeNull();
  });

  it("productDesign (servidor): solo la metadata del producto; desconocido → estándar", () => {
    expect(productDesign(product({ diseno: "correa" })).configurable).toBe(true);
    expect(productDesign(product()).configurable).toBe(false);
    expect(productDesign(product({ diseno: "otro" })).configurable).toBe(false);
  });
});

describe("diseño de la página de categoría", () => {
  it("el suyo o estándar; sin herencia; desconocido → error", () => {
    expect(resolveCategoryDesign(node("a"))).toBe("estandar");
    expect(resolveCategoryDesign(node("a", { diseno: "estandar" }))).toBe("estandar");
    expect(() => resolveCategoryDesign(node("a", { diseno: "otro" }))).toThrow(
      /Categoría «a»: el diseño de categoría «otro» no existe/,
    );
  });
});

describe("copia del backend", () => {
  it("apps/backend/src/lib/disenos.ts es idéntico a este fichero", () => {
    const here = readFileSync(new URL("./disenos.ts", import.meta.url), "utf8");
    const backend = readFileSync(
      new URL("../../../backend/src/lib/disenos.ts", import.meta.url),
      "utf8",
    );
    expect(backend).toBe(here);
  });
});
