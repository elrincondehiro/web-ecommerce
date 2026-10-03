import { describe, expect, it } from "vitest";
import products from "./__fixtures__/products.json";
import {
  getProductPricing,
  isVariantInStock,
  metaDescription,
  productsInCategory,
  sliceRange,
  type StoreProduct,
  type StoreVariant,
} from "./catalog";

const catalog = products as unknown as StoreProduct[];
const byHandle = (h: string) => catalog.find((p) => p.handle === h)!;
const variant = (v: Partial<StoreVariant>) => ({ id: "v", title: "V", ...v }) as StoreVariant;

describe("isVariantInStock", () => {
  it("sin gestión de inventario o con backorder siempre hay stock", () => {
    expect(isVariantInStock(variant({ manage_inventory: false, inventory_quantity: 0 }))).toBe(
      true,
    );
    expect(
      isVariantInStock(
        variant({ manage_inventory: true, allow_backorder: true, inventory_quantity: 0 }),
      ),
    ).toBe(true);
  });

  it("con inventario depende de la cantidad", () => {
    expect(isVariantInStock(variant({ manage_inventory: true, inventory_quantity: 3 }))).toBe(true);
    expect(isVariantInStock(variant({ manage_inventory: true, inventory_quantity: 0 }))).toBe(
      false,
    );
    expect(isVariantInStock(variant({ manage_inventory: true }))).toBe(false);
  });
});

describe("getProductPricing", () => {
  it("precio mínimo con IVA, rango y stock por variante", () => {
    const p = getProductPricing(byHandle("mock-camiseta-clasico-001"));
    expect(p.fromAmount).toBe(4.95);
    expect(p.currencyCode).toBe("eur");
    expect(p.hasPriceRange).toBe(true);
    expect(p.inStock).toBe(true);
    expect(p.variants.filter((v) => !v.inStock).map((v) => v.title)).toEqual(["S", "L"]);
  });

  it("variante única: sin rango", () => {
    const p = getProductPricing(byHandle("mock-taza-esencial-002"));
    expect(p.hasPriceRange).toBe(false);
    expect(p.fromAmount).toBe(41.95);
  });

  it("sin precios calculados (catálogo de build)", () => {
    const p = getProductPricing({ ...byHandle("mock-taza-esencial-002"), variants: [] });
    expect(p).toMatchObject({ fromAmount: null, currencyCode: null, inStock: false });
  });
});

describe("utilidades de listado", () => {
  it("sliceRange pagina como offset/limit", () => {
    expect(sliceRange([1, 2, 3, 4, 5], 1, 2)).toEqual([2, 3]);
    expect(sliceRange([1, 2, 3], 5, 2)).toEqual([]);
  });

  it("productsInCategory filtra por id de categoría", () => {
    const ropa = catalog[0]!.categories![0]!.id;
    const res = productsInCategory(catalog, ropa);
    expect(res.length).toBeGreaterThan(0);
    expect(res.every((p) => p.categories?.some((c) => c.id === ropa))).toBe(true);
  });

  it("metaDescription recorta sin partir palabras", () => {
    expect(metaDescription("  hola   mundo ")).toBe("hola mundo");
    const out = metaDescription("palabra ".repeat(40), 30);
    expect(out.length).toBeLessThanOrEqual(30);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/pal…$/);
  });
});
