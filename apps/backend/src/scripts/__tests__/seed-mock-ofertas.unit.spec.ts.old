import { baseCatalog, salePrice, spread } from "../seed-mock-ofertas";

describe("salePrice", () => {
  it("rebaja un 20 % y redondea a ,x5 por debajo", () => {
    expect(salePrice(44.95)).toBe(35.95);
    expect(salePrice(10)).toBe(7.95);
    expect(salePrice(4.95)).toBe(3.95);
  });
  it("siempre es menor que el original y > 0", () => {
    for (const p of [0.1, 1, 4.95, 19.99, 89.95]) {
      expect(salePrice(p)).toBeLessThan(p);
      expect(salePrice(p)).toBeGreaterThan(0);
    }
  });
});

describe("spread", () => {
  it("elige N elementos repartidos y sin repetir", () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    const out = spread(items, 16, 1);
    expect(out).toHaveLength(16);
    expect(new Set(out).size).toBe(16);
  });
  it("devuelve todo si hay menos que N", () => {
    expect(spread([1, 2], 5)).toEqual([1, 2]);
  });
});

describe("baseCatalog", () => {
  it("solo el catálogo base (001–024, sin v2), por título", () => {
    const p = (handle: string, title: string) => ({ handle, title });
    const out = baseCatalog([
      p("mock-taza-esencial-002", "Taza"),
      p("mock-aceite-023", "Aceite"),
      p("mock-aceite-063", "Aceite 63"),
      p("mock-v2-polo-001", "Polo"),
      p("mock-camiseta-001", "Camiseta"),
    ]);
    expect(out.map((x) => x.handle)).toEqual([
      "mock-aceite-023",
      "mock-camiseta-001",
      "mock-taza-esencial-002",
    ]);
  });
});
