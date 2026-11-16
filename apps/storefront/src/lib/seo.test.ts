import { describe, expect, it } from "vitest";
import products from "./__fixtures__/products.json";
import type { StoreProduct, StoreVariant } from "./catalog";
import { productJsonLd } from "./seo";

const SITE = "https://tienda.example";
const all = products as unknown as StoreProduct[];
type Offer = {
  "@type": string;
  price: number;
  priceCurrency: string;
  availability: string;
  itemCondition: string;
  url: string;
  priceSpecification?: Record<string, unknown>[];
};

/** Producto de una sola variante a partir del primero de los fixtures. */
function single(over: Partial<StoreVariant> = {}): StoreProduct {
  const p = structuredClone(all[0]!);
  p.variants = [{ ...p.variants![0]!, ...over }];
  return p;
}

describe("JSON-LD de la ficha (offers, fase 13)", () => {
  it("una variante: Product con Offer (precio > 0, EUR, stock, estado, url y sku)", () => {
    const ld = productJsonLd(single(), SITE) as Record<string, unknown> & { offers: Offer };
    expect(ld["@type"]).toBe("Product");
    expect(ld.sku).toBe("MOCK-017-1");
    expect(ld.offers).toMatchObject({
      "@type": "Offer",
      price: 17.95,
      priceCurrency: "EUR",
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
      url: `${SITE}/producto/mock-abrigo-esencial-017/`,
    });
    // En oferta: el anterior como precio tachado
    expect(ld.offers.priceSpecification).toEqual([
      {
        "@type": "UnitPriceSpecification",
        priceType: "https://schema.org/StrikethroughPrice",
        price: 21.95,
        priceCurrency: "EUR",
      },
    ]);
    expect((ld.brand as { name: string }).name).toBe("Hiro");
  });

  it("agotado → OutOfStock; sin precio → sin offers; configurable → sin offers", () => {
    const out = productJsonLd(single({ inventory_quantity: 0 }), SITE) as { offers: Offer };
    expect(out.offers.availability).toBe("https://schema.org/OutOfStock");
    const bare = single();
    delete bare.variants![0]!.calculated_price;
    const noPrice = productJsonLd(bare, SITE);
    expect(noPrice).not.toHaveProperty("offers");
    expect(productJsonLd(single(), SITE, undefined, { offers: false })).not.toHaveProperty(
      "offers",
    );
  });

  it("varias variantes: ProductGroup con un Product y su Offer por variante", () => {
    const p = all.find((x) => (x.variants?.length ?? 0) > 1)!;
    const ld = productJsonLd(p, SITE) as {
      "@type": string;
      productGroupID: string;
      variesBy: string[];
      hasVariant: { name: string; sku: string; size?: string; color?: string; offers: Offer }[];
    };
    expect(ld["@type"]).toBe("ProductGroup");
    expect(ld.productGroupID).toBe(p.handle);
    expect(ld.hasVariant).toHaveLength(p.variants!.length);
    expect(ld.variesBy).toEqual(
      expect.arrayContaining(["https://schema.org/size", "https://schema.org/color"]),
    );
    const v = ld.hasVariant[0]!;
    expect(v.sku).toBe(p.variants![0]!.sku);
    expect(v.size).toBeTruthy();
    expect(v.name).toContain(p.title);
    expect(v.offers.price).toBeGreaterThan(0);
  });

  it("contenido neto: precio por kilo como referenceQuantity (UnitPriceSpecification)", () => {
    const p = single({ metadata: { neto_g: 3000 } });
    const spec = (productJsonLd(p, SITE) as { offers: Offer }).offers.priceSpecification!;
    expect(spec.at(-1)).toMatchObject({
      "@type": "UnitPriceSpecification",
      price: 17.95,
      referenceQuantity: {
        value: 3000,
        unitCode: "GRM",
        valueReference: { value: 1000, unitCode: "GRM" },
      },
    });
  });
});

describe("JSON-LD: foto y descripción de cada variante (merchant listing)", () => {
  it("foto propia de la variante (la que no comparten todas) o la del producto", () => {
    const p = structuredClone(all.find((x) => (x.variants?.length ?? 0) > 1)!);
    const img = (url: string, rank: number) => ({ id: url, url, rank });
    p.variants = p.variants!.slice(0, 2);
    p.variants[0]!.images = [img("/g.jpg", 0), img("/rojo.jpg", 1)] as never;
    p.variants[1]!.images = [img("/g.jpg", 0)] as never;
    const ld = productJsonLd(p, SITE, "/portada.jpg") as unknown as {
      hasVariant: { image: string; description?: string }[];
    };
    expect(ld.hasVariant.map((v) => v.image)).toEqual([`${SITE}/rojo.jpg`, `${SITE}/portada.jpg`]);
    if (p.description) expect(ld.hasVariant[0]!.description).toBeTruthy();
  });
});
