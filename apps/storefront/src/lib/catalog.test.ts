import { describe, expect, it } from "vitest";
import products from "./__fixtures__/products.json";
import {
  analyticRows,
  discountPercent,
  dryMatter,
  getProductPricing,
  isDiscontinued,
  isVariantInStock,
  metaDescription,
  minimumNote,
  replacementHandle,
  type StoreProduct,
  type StoreVariant,
  unitPrice,
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
  // Fixtures de catalog:mock (Fase S): -013 tiene «S / Azul» agotada; -018 es variante única.
  it("precio mínimo con IVA, rango y stock por variante", () => {
    const p = getProductPricing(byHandle("mock-collar-sport-013"));
    expect(p.fromAmount).toBe(15.95);
    expect(p.currencyCode).toBe("eur");
    expect(p.hasPriceRange).toBe(true);
    expect(p.inStock).toBe(true);
    expect(p.variants.filter((v) => !v.inStock).map((v) => v.title)).toEqual(["S / Azul"]);
  });

  it("variante única: sin rango", () => {
    const p = getProductPricing(byHandle("mock-clicker-esencial-018"));
    expect(p.hasPriceRange).toBe(false);
    expect(p.fromAmount).toBe(6.9);
  });

  it("todas las variantes agotadas → producto agotado", () => {
    expect(getProductPricing(byHandle("mock-cama-eco-030")).inStock).toBe(false);
  });

  it("sin precios calculados (catálogo de build)", () => {
    const p = getProductPricing({ ...byHandle("mock-clicker-esencial-018"), variants: [] });
    expect(p).toMatchObject({ fromAmount: null, currencyCode: null, inStock: false });
  });
});

describe("precio por unidad (S-2)", () => {
  const v = (amount: number, metadata: Record<string, unknown>) =>
    ({
      id: "v",
      metadata,
      calculated_price: { calculated_amount_with_tax: amount, currency_code: "eur" },
    }) as unknown as StoreVariant;
  it("€/kg con neto_g y €/l con neto_ml, a céntimos", () => {
    expect(unitPrice(31.95, v(31.95, { neto_g: 3000 }))).toEqual({ amount: 10.65, unit: "kg" });
    expect(unitPrice(13.9, v(13.9, { neto_ml: 250 }))).toEqual({ amount: 55.6, unit: "l" });
  });
  it("sin contenido neto válido o sin precio → null", () => {
    expect(unitPrice(5, v(5, {}))).toBeNull();
    expect(unitPrice(5, v(5, { neto_g: 0 }))).toBeNull();
    expect(unitPrice(5, v(5, { neto_g: "3000" }))).toBeNull();
    expect(unitPrice(null, v(5, { neto_g: 3000 }))).toBeNull();
  });
  it("fixtures: el producto anuncia el €/kg de su variante más barata", () => {
    const p = getProductPricing(byHandle("mock-pienso-premium-001"));
    expect(p.unitPrice).toEqual({ amount: 10.65, unit: "kg" });
    expect(p.variants.every((x) => x.unitPrice?.unit === "kg")).toBe(true);
    expect(getProductPricing(byHandle("mock-clicker-esencial-018")).unitPrice).toBeNull();
  });
});

describe("granel (S-3)", () => {
  const bulkVariant = (qty: number, extra: Record<string, unknown> = {}) =>
    ({
      id: "vg",
      title: "Única",
      manage_inventory: true,
      allow_backorder: false,
      inventory_quantity: qty,
      metadata: { paso_g: 5, min_g: 100 },
      calculated_price: { calculated_amount_with_tax: 0.1, currency_code: "eur" },
      ...extra,
    }) as unknown as StoreVariant;
  const product = (v: StoreVariant) => ({ id: "p", variants: [v] }) as unknown as StoreProduct;

  it("«Desde» el precio del mínimo, €/kg y stock en gramos", () => {
    const p = getProductPricing(product(bulkVariant(480)));
    expect(p.isBulk).toBe(true);
    expect(p.fromAmount).toBe(2);
    expect(p.hasPriceRange).toBe(true);
    expect(p.unitPrice).toEqual({ amount: 20, unit: "kg" });
    expect(p.variants[0]?.bulk).toEqual({ stepG: 5, minG: 100, stepAmount: 0.1, stockG: 2400 });
    expect(p.inStock).toBe(true);
    expect(minimumNote(p)).toBe("mínimo 100\u00a0g");
  });

  it("agotado si no llega al mínimo; sin gestión de inventario, siempre", () => {
    expect(getProductPricing(product(bulkVariant(19))).inStock).toBe(false);
    const free = getProductPricing(product(bulkVariant(0, { manage_inventory: false })));
    expect(free.inStock).toBe(true);
    expect(free.variants[0]?.bulk?.stockG).toBeNull();
  });

  it("oferta: precio anterior del mínimo", () => {
    const sale = bulkVariant(480, {
      calculated_price: {
        calculated_amount_with_tax: 0.09,
        original_amount_with_tax: 0.1,
        currency_code: "eur",
        calculated_price: { price_list_type: "sale" },
      },
    });
    const p = getProductPricing(product(sale));
    expect([p.fromAmount, p.wasAmount, p.discountPercent]).toEqual([1.8, 2, 10]);
    expect(p.unitPrice).toEqual({ amount: 18, unit: "kg" });
  });

  it("productos normales: sin granel", () => {
    const p = getProductPricing(byHandle("mock-clicker-esencial-018"));
    expect(p.isBulk).toBe(false);
    expect(minimumNote(p)).toBeNull();
  });
});

describe("componentes analíticos (S-2)", () => {
  it("fijos en orden, materia seca con humedad, y después los analitico:X", () => {
    const rows = analyticRows({
      metadata: {
        humedad_pct: 9,
        "analitico:Calcio": "1,1 %",
        proteina_pct: 25,
        grasa_pct: 15,
        marca: "Hiro",
      },
    });
    expect(rows).toEqual([
      { label: "Proteína bruta", value: 25, dryMatter: 27.5 },
      { label: "Grasa bruta", value: 15, dryMatter: 16.5 },
      { label: "Humedad", value: 9, dryMatter: null },
      { label: "Calcio", value: "1,1 %", dryMatter: null },
    ]);
  });
  it("sin humedad: sin materia seca; sin datos: sin filas", () => {
    expect(analyticRows({ metadata: { proteina_pct: 50 } })[0]?.dryMatter).toBeNull();
    expect(analyticRows({ metadata: { marca: "Hiro" } })).toEqual([]);
    expect(analyticRows({})).toEqual([]);
    expect(dryMatter(9, 75)).toBe(36);
    expect(dryMatter(9, 100)).toBeNull();
  });
});

describe("utilidades de listado", () => {
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

  it("fixtures: producto en oferta (Price List sale de catalog:import)", () => {
    const pricing = getProductPricing(byHandle("mock-lata-confort-005"));
    expect(pricing).toMatchObject({ fromAmount: 8.95, wasAmount: 10.95, discountPercent: 18 });
  });

  it("sin oferta: null", () => {
    const pricing = getProductPricing(byHandle("mock-clicker-esencial-018"));
    expect(pricing.wasAmount).toBeNull();
    expect(pricing.discountPercent).toBeNull();
  });
});

describe("descatalogado (Fase E)", () => {
  it("solo con metadata.descatalogado = true; sustituto con handle válido", () => {
    expect(isDiscontinued({ metadata: { descatalogado: true } })).toBe(true);
    expect(isDiscontinued({ metadata: { descatalogado: "sí" } })).toBe(false);
    expect(isDiscontinued({ metadata: null })).toBe(false);
    expect(replacementHandle({ metadata: { sustituto: "collar-nylon" } })).toBe("collar-nylon");
    expect(replacementHandle({ metadata: { sustituto: "../x" } })).toBeNull();
    expect(replacementHandle({ metadata: {} })).toBeNull();
  });
});
