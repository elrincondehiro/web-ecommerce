import { priceFor, slug } from "../seed-mock";

describe("seed-mock helpers", () => {
  it("slug: minúsculas, sin acentos ni símbolos", () => {
    expect(slug("Café en grano Vintage 008")).toBe("cafe-en-grano-vintage-008");
    expect(slug("  ¡Turrón & Miel!  ")).toBe("turron-miel");
  });

  it("priceFor: determinista, entre 4,95 y 89,95 € y con 2 decimales", () => {
    expect(priceFor(3, 1)).toBe(priceFor(3, 1));
    for (let i = 0; i < 200; i++) {
      for (let v = 0; v < 4; v++) {
        const p = priceFor(i, v);
        expect(p).toBeGreaterThanOrEqual(4.95);
        expect(p).toBeLessThanOrEqual(89.95);
        expect(Math.round(p * 100) / 100).toBe(p);
      }
    }
  });
});
