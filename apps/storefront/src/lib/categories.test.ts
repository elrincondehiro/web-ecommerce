import { describe, expect, it } from "vitest";
import type { StoreProduct } from "./catalog";
import {
  buildCategoryTree,
  categoryHref,
  categoryNames,
  deepestCategory,
  facetCategories,
  narrowCategories,
  productTreeHandles,
  productsInSubtree,
  pruneEmpty,
  subtreeIds,
} from "./categories";

// perro (0) ─ alimentacion (0) ─ piensos (0)
//           │                  └ snacks (1)
//           └ juguetes (1)
// gato (1)  ─ juguetes-gato (0)
const cat = (id: string, rank: number, parent?: string, name = id) => ({
  id,
  handle: id,
  name,
  description: "",
  rank,
  parent_category_id: parent ?? null,
});
const list = [
  cat("gato", 1),
  cat("snacks", 1, "alimentacion"),
  cat("perro", 0),
  cat("juguetes", 1, "perro", "Juguetes"),
  cat("piensos", 0, "alimentacion"),
  cat("alimentacion", 0, "perro"),
  cat("juguetes-gato", 0, "gato", "Juguetes"),
  cat("huerfana", 0, "no-existe"),
];
const tree = buildCategoryTree(list as unknown as Parameters<typeof buildCategoryTree>[0]);
const product = (id: string, ...cats: string[]) =>
  ({ id, categories: cats.map((c) => ({ id: c, handle: c })) }) as unknown as StoreProduct;

describe("buildCategoryTree", () => {
  it("raíces e hijas por rank; padre desconocido → raíz", () => {
    expect(tree.roots.map((r) => r.handle)).toEqual(["huerfana", "perro", "gato"]);
    expect(tree.byHandle.get("perro")!.children.map((c) => c.handle)).toEqual([
      "alimentacion",
      "juguetes",
    ]);
    expect(tree.byHandle.get("alimentacion")!.children.map((c) => c.handle)).toEqual([
      "piensos",
      "snacks",
    ]);
  });
  it("cadena desde la raíz y profundidad", () => {
    const n = tree.byHandle.get("piensos")!;
    expect(n.path.map((p) => p.handle)).toEqual(["perro", "alimentacion", "piensos"]);
    expect(n.depth).toBe(2);
    expect(categoryHref(n)).toBe("/categoria/piensos/");
  });
  it("`all` en preorden (padre antes que hijas)", () => {
    expect(tree.all.map((n) => n.handle)).toEqual([
      "huerfana",
      "perro",
      "alimentacion",
      "piensos",
      "snacks",
      "juguetes",
      "gato",
      "juguetes-gato",
    ]);
  });
});

describe("subárboles y productos", () => {
  const products = [
    product("p1", "piensos"),
    product("p2", "juguetes-gato"),
    product("p3", "snacks"),
  ];
  it("subtreeIds incluye la propia categoría y descendientes", () => {
    expect([...subtreeIds(tree.byHandle.get("alimentacion")!)].sort()).toEqual([
      "alimentacion",
      "piensos",
      "snacks",
    ]);
  });
  it("productsInSubtree: los del padre incluyen los de las hijas, en orden", () => {
    expect(productsInSubtree(products, tree.byHandle.get("perro")!).map((p) => p.id)).toEqual([
      "p1",
      "p3",
    ]);
  });
  it("pruneEmpty quita categorías sin productos en su subárbol", () => {
    const pruned = pruneEmpty(tree, products);
    expect(pruned.all.map((n) => n.handle)).toEqual([
      "perro",
      "alimentacion",
      "piensos",
      "snacks",
      "gato",
      "juguetes-gato",
    ]);
    expect(pruned.byHandle.get("perro")!.children.map((c) => c.handle)).toEqual(["alimentacion"]);
  });
  it("deepestCategory elige la más concreta", () => {
    expect(deepestCategory(tree, product("x", "perro", "piensos", "gato"))?.handle).toBe("piensos");
    expect(deepestCategory(tree, product("x"))).toBeNull();
  });
  it("productTreeHandles: la suya y sus ancestros", () => {
    expect(productTreeHandles(tree, product("x", "piensos")).sort()).toEqual([
      "alimentacion",
      "perro",
      "piensos",
    ]);
  });
});

describe("filtro por niveles", () => {
  it("sin selección: raíces; con selección: ella y sus hijas", () => {
    expect([...facetCategories(tree, []).keys()]).toEqual(["huerfana", "perro", "gato"]);
    expect([...facetCategories(tree, ["perro"]).keys()]).toEqual([
      "perro",
      "alimentacion",
      "juguetes",
    ]);
    expect([...facetCategories(tree, ["perro", "alimentacion"]).keys()]).toEqual([
      "perro",
      "alimentacion",
      "piensos",
      "snacks",
      "juguetes",
    ]);
  });
  it("categoría fija: solo sus hijas", () => {
    expect([...facetCategories(tree, [], "alimentacion").keys()]).toEqual(["piensos", "snacks"]);
  });
  it("gana la más concreta: se quita el ancestro elegido", () => {
    expect(narrowCategories(tree, ["perro", "piensos", "gato"])).toEqual(["piensos", "gato"]);
    expect(narrowCategories(tree, ["desconocida"])).toEqual(["desconocida"]);
  });
  it("nombres repetidos llevan el de su raíz", () => {
    const names = categoryNames(tree);
    expect(names.get("juguetes")).toBe("Juguetes (perro)");
    expect(names.get("juguetes-gato")).toBe("Juguetes (gato)");
    expect(names.get("piensos")).toBe("piensos");
  });
});
