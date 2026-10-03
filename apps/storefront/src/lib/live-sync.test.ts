import { describe, expect, it } from "vitest";
import type { StoreProduct } from "./catalog";
import { liveEntries, livePriceScript, liveStockCss } from "./live-sync";

const variant = (id: string, amount: number, qty: number) => ({
  id,
  title: id,
  manage_inventory: true,
  allow_backorder: false,
  inventory_quantity: qty,
  calculated_price: { calculated_amount_with_tax: amount, currency_code: "eur" },
});

const products = [
  { id: "prod_A", variants: [variant("variant_1", 19, 3), variant("variant_2", 25, 0)] },
  { id: "prod_B", variants: [variant("variant_3", 9.5, 0)] },
] as unknown as StoreProduct[];

describe("liveEntries", () => {
  it("genera entradas de producto y variante con precio formateado", () => {
    const entries = liveEntries(products);
    expect(entries.map((e) => [e.id, e.level, e.inStock, e.range ?? null])).toEqual([
      ["prod_A", "product", true, true],
      ["variant_1", "variant", true, null],
      ["variant_2", "variant", false, null],
      ["prod_B", "product", false, false],
      ["variant_3", "variant", false, null],
    ]);
    expect(entries[0]?.price).toMatch(/^19,00\s€$/);
  });

  it("descarta ids que no son seguros para un selector CSS", () => {
    const bad = [{ id: 'x"]{}', variants: [] }] as unknown as StoreProduct[];
    expect(liveEntries(bad)).toEqual([]);
  });
});

describe("liveStockCss", () => {
  it("oculta/muestra por nivel con selectores de id", () => {
    const css = liveStockCss(liveEntries(products));
    expect(css).toContain(
      ':is([data-pid="prod_A"])[data-stock] [data-if-stock="out"]{display:none}',
    );
    expect(css).toContain(
      ':is([data-pid="prod_B"])[data-stock] [data-if-stock="out"]{display:revert-layer}',
    );
    expect(css).toContain(
      ':is([data-pid="variant_2"],[data-pid="variant_3"])[data-vstock] [data-if-vstock="in"]{display:none}',
    );
  });
});

describe("livePriceScript", () => {
  it("incluye el mapa de precios y escapa '<'", () => {
    const js = livePriceScript([
      { id: "prod_A", level: "product", inStock: true, price: "<b>1 €", range: true },
    ]);
    expect(js).toContain('"prod_A":["\\u003cb>1 €",1]');
    expect(js).not.toContain("<b>");
  });

  it("vacío si no hay precios", () => {
    expect(livePriceScript([])).toBe("");
  });
});
