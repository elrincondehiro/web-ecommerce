import { describe, expect, it } from "vitest";
import {
  NOTICE_CODES,
  actionUrl,
  cartCookieOptions,
  classifyCartError,
  isErrorNotice,
  isValidId,
  itemCount,
  noticeMessage,
  redirectTarget,
  safeBackPath,
} from "./cart";

class FetchError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

describe("cartCookieOptions", () => {
  it("httpOnly, SameSite=Lax, path=/ y 30 días; Secure configurable", () => {
    expect(cartCookieOptions(true)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 2_592_000,
    });
    expect(cartCookieOptions(false).secure).toBe(false);
  });
});

describe("isValidId", () => {
  it("acepta ids de Medusa y rechaza el resto", () => {
    expect(isValidId("cart_01M41X3H3PRP6E8QB56M136TMA")).toBe(true);
    expect(isValidId("cali_01M41X3HQ2MNMQ6B020AZ7PTG8")).toBe(true);
    for (const bad of ["", "a b", "cart;x", "../x", "x".repeat(65), undefined, null]) {
      expect(isValidId(bad)).toBe(false);
    }
  });
});

describe("safeBackPath (open redirect)", () => {
  it("conserva rutas relativas del sitio, con query y sin hash", () => {
    expect(safeBackPath("/producto/camiseta/")).toBe("/producto/camiseta/");
    expect(safeBackPath("/productos/2/?a=1#x")).toBe("/productos/2/?a=1");
  });
  it("rechaza URLs absolutas, protocol-relative, backslash y basura", () => {
    for (const bad of [
      "https://evil.example/",
      "//evil.example/",
      "/\\evil.example",
      "javascript:alert(1)",
      "producto/x/",
      "/a\nb",
      "",
      42,
      null,
      "/" + "a".repeat(600),
    ]) {
      expect(safeBackPath(bad)).toBe("/");
    }
  });
  it("normaliza rutas con ..", () => {
    expect(safeBackPath("/a/../carrito/")).toBe("/carrito/");
  });
});

describe("redirectTarget / actionUrl", () => {
  it("añade el aviso como fragmento", () => {
    expect(redirectTarget("/producto/x/", "added")).toBe("/producto/x/#carrito-added");
    expect(redirectTarget("//evil", "stock")).toBe("/#carrito-stock");
  });
  it("formularios apuntan a la ruta on-demand con ?_action", () => {
    expect(actionUrl("cart.add")).toBe("/carrito/?_action=cart.add");
  });
});

describe("classifyCartError", () => {
  it("traduce los errores reales de la Store API (Medusa 2.21.2)", () => {
    expect(
      classifyCartError(new FetchError("Some variant does not have the required inventory", 400)),
    ).toBe("stock");
    expect(classifyCartError(new FetchError("Cart with id 'cart_x' not found", 404))).toBe(
      "cart_invalid",
    );
    expect(classifyCartError(new FetchError("Cart id not found: cart_x", 404))).toBe(
      "cart_invalid",
    );
    expect(classifyCartError(new FetchError("Cart cart_x is already completed.", 400))).toBe(
      "cart_invalid",
    );
    expect(classifyCartError(new FetchError("Line item with id: li_x was not found", 404))).toBe(
      "error",
    );
    expect(classifyCartError(new Error("fetch failed"))).toBe("error");
    expect(classifyCartError("x")).toBe("error");
  });
});

describe("itemCount y avisos", () => {
  it("suma cantidades", () => {
    expect(itemCount({ items: [{ quantity: 2 }, { quantity: 3 }] })).toBe(5);
    expect(itemCount(null)).toBe(0);
  });
  it("mensajes y errores", () => {
    expect(noticeMessage("added", "Camiseta")).toBe("Añadido: Camiseta");
    expect(noticeMessage("added")).toBe("Añadido al carrito");
    expect(NOTICE_CODES.filter(isErrorNotice)).toEqual(["stock", "expired", "invalid", "error"]);
  });
});
