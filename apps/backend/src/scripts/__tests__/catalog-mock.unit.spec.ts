import { readFileSync } from "node:fs";
import path from "node:path";
import { buildMockCatalog, leafCategories } from "../lib/catalog-mock";
import { readCategories, readProducts } from "../lib/catalog-sheet";
import { parseCsv } from "../lib/csv";

const TREE = path.join(__dirname, "../../../catalog/mock/categorias.csv");
const tree = () => readCategories(parseCsv(readFileSync(TREE, "utf8")));

describe("catalog:mock", () => {
  it("el árbol versionado es válido", () => {
    const { categories, errors } = tree();
    expect(errors).toEqual([]);
    expect(categories.filter((c) => !c.parent).map((c) => c.handle)).toEqual([
      "perro",
      "gato",
      "para-ti",
    ]);
  });

  it("300 productos: hoja válida para el importador, solo en hojas, determinista", () => {
    const { categories } = tree();
    const mock = buildMockCatalog(categories, 300);
    expect(buildMockCatalog(categories, 300).csv).toBe(mock.csv);
    const { products, errors, warnings } = readProducts(parseCsv(mock.csv));
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(products).toHaveLength(300);
    expect(new Set(products.map((p) => p.handle)).size).toBe(300);

    const leaves = new Set(leafCategories(categories).map((c) => c.handle));
    for (const p of products) {
      expect(p.categories).toHaveLength(1);
      expect(leaves.has(p.categories![0]!)).toBe(true);
    }
    // Todas las hojas tienen algún producto
    expect(new Set(products.map((p) => p.categories![0])).size).toBe(leaves.size);

    expect(mock.sale).toBeGreaterThan(10);
    expect(mock.featured).toBeGreaterThanOrEqual(8);
    expect(mock.bulk).toBeGreaterThan(0);
    const bulk = products.filter((p) => p.bulk);
    expect(bulk.every((p) => p.status === "published")).toBe(true);
    expect(products.some((p) => p.variants.some((v) => typeof v.netG === "number"))).toBe(true);
    expect(products.some((p) => typeof p.analytics.proteina_pct === "number")).toBe(true);
  });
});
