import { describe, expect, it } from "vitest";
import type { StoreProduct } from "./catalog";
import { LIVE_SYNC_APPLY, liveData, liveEntries } from "./live-sync";

const variant = (id: string, amount: number, qty: number) => ({
  id,
  title: id,
  manage_inventory: true,
  allow_backorder: false,
  inventory_quantity: qty,
  calculated_price: { calculated_amount_with_tax: amount, currency_code: "eur" },
});

const onSale = (id: string, amount: number, was: number) => ({
  ...variant(id, amount, 5),
  calculated_price: {
    calculated_amount_with_tax: amount,
    original_amount_with_tax: was,
    currency_code: "eur",
    calculated_price: { price_list_type: "sale" },
  },
});

const products = [
  { id: "prod_A", variants: [variant("variant_1", 19, 3), variant("variant_2", 25, 0)] },
  { id: "prod_B", variants: [variant("variant_3", 9.5, 0)] },
  { id: "prod_S", variants: [onSale("variant_s", 8, 10)] },
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
      ["prod_S", "product", true, false],
      ["variant_s", "variant", true, null],
    ]);
    expect(entries[0]?.price).toMatch(/^19,00\s€$/);
  });

  it("incluye precio anterior y descuento solo si hay oferta", () => {
    const entries = liveEntries(products);
    const sale = entries.find((e) => e.id === "prod_S");
    expect(sale?.was).toMatch(/^10,00\s€$/);
    expect(sale?.off).toBe("\u221220\u202f%");
    expect(entries.find((e) => e.id === "prod_A")?.was).toBeNull();
  });

  it("descarta ids que no son seguros", () => {
    const bad = [{ id: 'x"]{}', variants: [] }] as unknown as StoreProduct[];
    expect(liveEntries(bad)).toEqual([]);
  });
});

describe("liveData", () => {
  it("serializa id → [precio, rango, stock]", () => {
    const data = JSON.parse(liveData(liveEntries(products))) as Record<string, unknown[]>;
    expect(data["prod_A"]?.slice(1)).toEqual([1, 1]);
    expect(data["variant_2"]?.slice(1)).toEqual([0, 0]);
    expect(data["prod_A"]).toHaveLength(3);
    expect(data["prod_S"]?.slice(3)).toEqual([expect.stringMatching(/^10,00/), "\u221220\u202f%"]);
  });

  it("escapa '<' y '&' (va dentro de un <template>)", () => {
    const out = liveData([
      { id: "prod_A", level: "product", inStock: true, price: "<b>&amp;", range: true },
    ]);
    expect(out).not.toMatch(/[<&]/);
    expect(JSON.parse(out)).toEqual({ prod_A: ["<b>&amp;", 1, 1] });
  });
});

/** DOM mínimo para ejecutar LIVE_SYNC_APPLY en Node (sin jsdom). */
function fakeDom(json: string | null) {
  const el = (dataset: Record<string, string>, text = "") => ({
    dataset,
    textContent: text,
    hidden: false,
  });
  const card = el({ pid: "prod_A", stock: "out" });
  const row = el({ pid: "variant_2", vstock: "in" });
  const price = el({ price: "prod_A" }, "18,00 €");
  const from = el({ priceFrom: "prod_A" });
  from.hidden = true;
  const wasBox = el({ wasBox: "prod_S" });
  wasBox.hidden = true;
  const was = el({ was: "prod_S" }, "1,00 €");
  const off = el({ off: "prod_S" }, "−1 %");
  const wasBoxA = el({ wasBox: "prod_A" });
  const all: Record<string, unknown[]> = {
    "[data-pid]": [card, row],
    "[data-price]": [price],
    "[data-price-from]": [from],
    "[data-was-box]": [wasBox, wasBoxA],
    "[data-was]": [was],
    "[data-off]": [off],
  };
  let observer: { cb: () => void; disconnected: boolean } | null = null;
  const parent = {
    template: json === null ? null : { content: { textContent: json } },
    querySelector: () => parent.template,
  };
  const document = {
    currentScript: { parentNode: parent },
    querySelectorAll: (s: string) => all[s] ?? [],
  };
  class MutationObserver {
    constructor(cb: (r: unknown[], o: { disconnect(): void }) => void) {
      const self = { cb: () => {}, disconnected: false };
      self.cb = () => cb([], { disconnect: () => (self.disconnected = true) });
      observer = self;
    }
    observe() {}
  }
  const run = () =>
    new Function("document", "MutationObserver", LIVE_SYNC_APPLY)(document, MutationObserver);
  return {
    card,
    row,
    price,
    from,
    wasBox,
    wasBoxA,
    was,
    off,
    parent,
    run,
    observer: () => observer,
  };
}

describe("LIVE_SYNC_APPLY", () => {
  const json = liveData(liveEntries(products));

  it("aplica stock y precio si el <template> ya está", () => {
    const dom = fakeDom(json);
    dom.run();
    expect(dom.card.dataset.stock).toBe("in");
    expect(dom.row.dataset.vstock).toBe("out");
    expect(dom.price.textContent).toMatch(/^19,00\s€$/);
    expect(dom.from.hidden).toBe(false);
    expect(dom.observer()).toBeNull();
  });

  it("muestra el precio anterior y el descuento si hay oferta; los oculta si no", () => {
    const dom = fakeDom(json);
    dom.run();
    expect(dom.wasBox.hidden).toBe(false);
    expect(dom.was.textContent).toMatch(/^10,00\s€$/);
    expect(dom.off.textContent).toBe("\u221220\u202f%");
    expect(dom.wasBoxA.hidden).toBe(true);
  });

  it("espera al <template> con un MutationObserver y se desconecta", () => {
    const dom = fakeDom(null);
    dom.run();
    expect(dom.card.dataset.stock).toBe("out");
    dom.parent.template = { content: { textContent: json } };
    dom.observer()?.cb();
    expect(dom.card.dataset.stock).toBe("in");
    expect(dom.observer()?.disconnected).toBe(true);
  });
});
