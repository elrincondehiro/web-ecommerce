import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { readCategories, readProducts } from "../lib/catalog-sheet";
import { readCorreaSheets } from "../lib/correas-sheet";
import { decodeUtf8, parseCsv } from "../lib/csv";
import { readFamilies } from "../lib/families-sheet";

/**
 * Las hojas de `catalog/plantilla/` (una carpeta por caso) y de `catalog/mock/` se leen sin
 * errores ni avisos con el lector real del importador: si un cambio en el importador rompe una
 * plantilla, falla aquí (la carga contra Medusa la prueba integration-tests/http/catalogo.spec.ts).
 */
const CATALOG = path.join(__dirname, "../../../catalog");
const sheet = (file: string) => parseCsv(decodeUtf8(readFileSync(file)));
const folders = (base: string) =>
  readdirSync(path.join(CATALOG, base), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(CATALOG, base, e.name));

describe.each(["plantilla", "mock"])("catalog/%s", (base) => {
  const dirs = [path.join(CATALOG, base), ...folders(base)];

  it.each(dirs.map((d) => [path.relative(CATALOG, d), d]))("%s: hojas válidas", (_, dir) => {
    const file = (name: string) => path.join(dir, name);
    if (existsSync(file("categorias.csv"))) {
      const r = readCategories(sheet(file("categorias.csv")));
      expect(r.errors).toEqual([]);
      expect(r.warnings).toEqual([]);
    }
    // mock/productos.csv lo genera catalog:mock (lo prueba catalog-mock.unit.spec.ts)
    if (existsSync(file("productos.csv")) && dir !== path.join(CATALOG, "mock")) {
      const r = readProducts(sheet(file("productos.csv")));
      expect(r.errors).toEqual([]);
      expect(r.warnings).toEqual([]);
      expect(r.products.length).toBeGreaterThan(0);
    }
    if (existsSync(file("familias.csv"))) {
      expect(readFamilies(sheet(file("familias.csv"))).errors).toEqual([]);
    }
    if (existsSync(file("correas.csv"))) {
      const names = ["correas", "largos", "mosquetones", "piezas", "ajustes"];
      const texts = Object.fromEntries(
        names.map((n) => [`${n}.csv`, readFileSync(file(`${n}.csv`), "utf8")]),
      );
      expect(readCorreaSheets(texts as never).errors).toEqual([]);
    }
  });

  it("cada carpeta de la plantilla tiene su LEEME.md", () => {
    if (base !== "plantilla") return;
    for (const d of folders(base)) expect(existsSync(path.join(d, "LEEME.md"))).toBe(true);
  });
});
