import { describe, expect, it } from "vitest";
import type { StoreProduct } from "./catalog";
import { cartRelatedHandles, productRelated, relatedHandles, wishlistAvailable } from "./related";

const v = (id: string, qty: number) => ({
  id,
  title: id,
  manage_inventory: true,
  allow_backorder: false,
  inventory_quantity: qty,
  calculated_price: { calculated_amount_with_tax: 10, currency_code: "eur" },
});
const p = (
  handle: string,
  opts: { stock?: number; meta?: Record<string, unknown>; variants?: ReturnType<typeof v>[] } = {},
) =>
  ({
    id: `prod_${handle}`,
    handle,
    title: handle,
    metadata: opts.meta ?? {},
    variants: opts.variants ?? [v(`var_${handle}`, opts.stock ?? 5)],
  }) as unknown as StoreProduct;

describe("relacionados (Fase R)", () => {
  it("handles de la hoja: orden, sin vacíos, repetidos ni el propio", () => {
    expect(relatedHandles(p("a", { meta: { relacionados: "b| c ||b|a" } }))).toEqual(["b", "c"]);
    expect(relatedHandles(p("a"))).toEqual([]);
  });

  it("ficha: los de la hoja primero y relleno con la categoría (con stock primero) hasta 4", () => {
    const b = p("b");
    const gone = p("gone", { meta: { descatalogado: true } });
    const all = [b, gone, p("c")];
    const byHandle = new Map(all.map((x) => [x.handle, x]));
    const prod = p("a", { meta: { relacionados: "gone|b|nope" } });
    const cat = [prod, p("x", { stock: 0 }), p("y"), b, p("z"), p("w")];
    const out = productRelated(prod, byHandle, cat);
    // b (hoja; gone descatalogado y nope no existe), luego y, z, w (con stock) antes que x (agotado)
    expect(out.map((x) => x.handle)).toEqual(["b", "y", "z", "w"]);
    // Sin bastantes con stock: entran los agotados al final
    expect(
      productRelated(p("a"), new Map(), [p("x", { stock: 0 }), p("y")]).map((x) => x.handle),
    ).toEqual(["y", "x"]);
    // Las correas no rellenan
    const correa = p("correa-roja", { meta: { plantilla: "correa" } });
    expect(productRelated(p("a"), new Map(), [correa]).length).toBe(0);
  });

  it("carrito: relevancia (relacionado por más productos primero) y sin lo que ya está", () => {
    const cart = [
      p("a", { meta: { relacionados: "x|y|b" } }),
      p("b", { meta: { relacionados: "y|z" } }),
    ];
    expect(cartRelatedHandles(cart, new Set(["a", "b"]))).toEqual(["y", "x", "z"]);
  });

  it("lista de deseos: disponibles ahora, sin lo del carrito, lo más reciente primero", () => {
    const multi = p("m", { variants: [v("m1", 0), v("m2", 3)] });
    const items = [
      { product: p("a"), variantId: null, createdAt: "2026-10-01" },
      { product: p("b", { stock: 0 }), variantId: null, createdAt: "2026-10-05" },
      { product: multi, variantId: "m1", createdAt: "2026-10-04" }, // variante guardada agotada
      { product: multi, variantId: "m2", createdAt: "2026-10-03" },
      { product: p("c"), variantId: null, createdAt: "2026-10-06" },
      {
        product: p("d", { meta: { descatalogado: true } }),
        variantId: null,
        createdAt: "2026-10-07",
      },
    ];
    const inCart = { productIds: new Set(["prod_c"]), variantIds: new Set<string>() };
    expect(wishlistAvailable(items, inCart).map((i) => [i.product.handle, i.variantId])).toEqual([
      ["m", "m2"],
      ["a", null],
    ]);
    // La variante ya en el carrito no se repite
    const withVar = { productIds: new Set<string>(), variantIds: new Set(["m2"]) };
    expect(wishlistAvailable(items, withVar, 5).map((i) => i.product.handle)).toEqual(["c", "a"]);
  });
});
