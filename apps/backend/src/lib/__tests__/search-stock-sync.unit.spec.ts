import {
  STOCK_SYNC_FALLBACK_MS,
  STOCK_SYNC_OVERLAP_MS,
  computeSince,
  inventoryItemIds,
  productIdsFromItems,
} from "../search-stock-sync";

const now = new Date("2026-01-01T12:00:00.000Z");

describe("computeSince", () => {
  it("resta el solape a la marca anterior", () => {
    expect(computeSince("2026-01-01T11:55:00.000Z", now).toISOString()).toBe(
      new Date(Date.parse("2026-01-01T11:55:00.000Z") - STOCK_SYNC_OVERLAP_MS).toISOString(),
    );
  });

  it("sin marca o con marca inválida mira atrás el margen por defecto", () => {
    const expected = now.getTime() - STOCK_SYNC_FALLBACK_MS - STOCK_SYNC_OVERLAP_MS;
    expect(computeSince(null, now).getTime()).toBe(expected);
    expect(computeSince("no-es-fecha", now).getTime()).toBe(expected);
  });

  it("una marca en el futuro no deja huecos", () => {
    expect(computeSince("2030-01-01T00:00:00.000Z", now).getTime()).toBe(
      now.getTime() - STOCK_SYNC_OVERLAP_MS,
    );
  });
});

describe("dedupe de ids", () => {
  it("inventoryItemIds quita repetidos y vacíos", () => {
    expect(
      inventoryItemIds([
        { inventory_item_id: "iitem_1" },
        { inventory_item_id: "iitem_1" },
        { inventory_item_id: null },
        { inventory_item_id: "iitem_2" },
      ]),
    ).toEqual(["iitem_1", "iitem_2"]);
  });

  it("productIdsFromItems agrupa por producto", () => {
    expect(
      productIdsFromItems([
        { variants: [{ product_id: "prod_1" }, { product_id: "prod_1" }] },
        { variants: [{ product_id: "prod_2" }, null] },
        { variants: null },
      ]),
    ).toEqual(["prod_1", "prod_2"]);
  });
});
