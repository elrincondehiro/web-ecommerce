import { describe, expect, it } from "vitest";
import {
  WISH_NOTICES,
  WISH_NOTICE_CODES,
  classifyWishError,
  decodeWishPending,
  encodeWishPending,
  isWishError,
  wishRedirectTarget,
  wishRows,
  wishlistActionUrl,
} from "./wishlist";

const P = "prod_01M4S0R3EHNZCVW80NQZ1Z52FG";
const V = "variant_01M4S0R3EHNZCVW80NQZ1Z52FG";

describe("cookie de producto pendiente", () => {
  it("ida y vuelta, con y sin variante", () => {
    for (const t of [
      { product_id: P, variant_id: null },
      { product_id: P, variant_id: V },
    ]) {
      expect(decodeWishPending(encodeWishPending(t))).toEqual(t);
    }
  });

  it("rechaza valores manipulados (nunca lanza)", () => {
    for (const raw of [
      undefined,
      "",
      "x",
      `cart_1`,
      `${P}:`,
      `${P}:cart_1`,
      `${P}:${V}:extra`,
      `prod_${"a".repeat(80)}`,
      `${P};drop`,
      "prod_../../x",
    ]) {
      expect(decodeWishPending(raw), String(raw)).toBeNull();
    }
  });
});

describe("avisos y redirección", () => {
  it("URL de la action en la ruta privada", () => {
    expect(wishlistActionUrl("wishlist.add")).toBe("/cuenta/deseos/?_action=wishlist.add");
  });

  it("fragmento del aviso y ruta de vuelta solo del mismo sitio", () => {
    expect(wishRedirectTarget("/producto/x/", "wish_added")).toBe("/producto/x/#deseos-wish_added");
    expect(wishRedirectTarget("https://evil.example/", "wish_added")).toBe("/#deseos-wish_added");
    expect(wishRedirectTarget("//evil.example/", "wish_error")).toBe("/#deseos-wish_error");
  });

  it("todos los códigos tienen texto; errores marcados", () => {
    for (const c of WISH_NOTICE_CODES) expect(WISH_NOTICES[c].length).toBeGreaterThan(0);
    expect(isWishError("wish_error")).toBe(true);
    expect(isWishError("wish_discontinued")).toBe(true);
    expect(isWishError("wish_added")).toBe(false);
    expect(isWishError("wish_already")).toBe(false);
  });

  it("clasifica el error de descatalogado del backend", () => {
    expect(classifyWishError(new Error("Este producto está descatalogado."))).toBe(
      "wish_discontinued",
    );
    expect(classifyWishError(new Error("boom"))).toBe("wish_error");
    expect(classifyWishError("x")).toBe("wish_error");
  });
});

describe("wishRows", () => {
  const products = [
    { id: "prod_a", handle: "a", variants: [{ id: "variant_a1" }, { id: "variant_a2" }] },
    { id: "prod_b", handle: "b", variants: [{ id: "variant_b1" }] },
  ];

  it("mantiene el orden de la lista y omite productos que ya no se publican", () => {
    const rows = wishRows(
      [
        { id: "wli_3", product_id: "prod_b", variant_id: null },
        { id: "wli_2", product_id: "prod_gone", variant_id: null },
        { id: "wli_1", product_id: "prod_a", variant_id: "variant_a2" },
      ],
      products,
    );
    expect(rows.map((r) => [r.itemId, r.product.id, r.variantId])).toEqual([
      ["wli_3", "prod_b", null],
      ["wli_1", "prod_a", "variant_a2"],
    ]);
  });

  it("una variante guardada que ya no existe se trata como el producto", () => {
    const rows = wishRows(
      [{ id: "wli_1", product_id: "prod_a", variant_id: "variant_x" }],
      products,
    );
    expect(rows[0]?.variantId).toBeNull();
  });
});
