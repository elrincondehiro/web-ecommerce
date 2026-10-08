import { describe, expect, it } from "vitest";
import products from "./__fixtures__/products.json";
import {
  discountPercent,
  getProductPricing,
  isVariantInStock,
  metaDescription,
  productsInCategory,
  sliceRange,
  type StoreProduct,
  type StoreVariant,
  variantWasAmount,
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
  // 001 y 002 están en la Price List de prueba (−20 %, seed-mock-ofertas): precio rebajado.
  it("precio mínimo con IVA, rango y stock por variante", () => {
    const p = getProductPricing(byHandle("mock-camiseta-clasico-001"));
    expect(p.fromAmount).toBe(3.95);
    expect(p.currencyCode).toBe("eur");
    expect(p.hasPriceRange).toBe(true);
    expect(p.inStock).toBe(true);
    expect(p.variants.filter((v) => !v.inStock).map((v) => v.title)).toEqual(["S", "L"]);
  });

  it("variante única: sin rango", () => {
    const p = getProductPricing(byHandle("mock-taza-esencial-002"));
    expect(p.hasPriceRange).toBe(false);
    expect(p.fromAmount).toBe(33.55);
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

describe("ofertas (Price List sale)", () => {
  const sale = (amount: number, was: number, type: string | null = "sale") =>
    variant({
      id: `v${amount}`,
      manage_inventory: false,
      calculated_price: {
        calculated_amount_with_tax: amount,
        original_amount_with_tax: was,
        currency_code: "eur",
        calculated_price: { price_list_type: type },
      },
    } as unknown as Partial<StoreVariant>);

  it("precio anterior solo con lista sale y precio menor", () => {
    expect(variantWasAmount(sale(8, 10))).toBe(10);
    expect(variantWasAmount(sale(10, 10))).toBeNull();
    expect(variantWasAmount(sale(8, 10, "override"))).toBeNull();
    expect(variantWasAmount(sale(8, 10, null))).toBeNull();
  });

  it("descuento entero redondeado hacia abajo", () => {
    expect(discountPercent(8, 10)).toBe(20);
    expect(discountPercent(63.15, 78.95)).toBe(20);
    expect(discountPercent(7.95, 10)).toBe(20);
    expect(discountPercent(7.96, 10)).toBe(20);
    expect(discountPercent(8.01, 10)).toBe(19);
  });

  it("el producto anuncia la oferta de la variante más barata", () => {
    const p = { id: "p", variants: [sale(12, 15), sale(8, 10)] } as unknown as StoreProduct;
    const pricing = getProductPricing(p);
    expect(pricing.fromAmount).toBe(8);
    expect(pricing.wasAmount).toBe(10);
    expect(pricing.discountPercent).toBe(20);
  });

  it("fixtures: producto en oferta (Price List sale de prueba)", () => {
    const pricing = getProductPricing(byHandle("mock-camiseta-clasico-001"));
    expect(pricing).toMatchObject({ fromAmount: 3.95, wasAmount: 4.95, discountPercent: 20 });
  });

  it("sin oferta: null", () => {
    const pricing = getProductPricing(byHandle("mock-sudadera-artesano-006"));
    expect(pricing.wasAmount).toBeNull();
    expect(pricing.discountPercent).toBeNull();
  });
});
