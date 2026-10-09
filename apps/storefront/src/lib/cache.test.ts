import { describe, expect, it } from "vitest";
import { isPrivatePath } from "./cache";

describe("isPrivatePath", () => {
  it("rutas por usuario", () => {
    for (const p of [
      "/carrito/",
      "/carrito/flyout/",
      "/checkout/",
      "/checkout/completar/",
      "/pedido/order_1/",
      "/cuenta",
      "/cuenta/",
      "/cuenta/entrar/",
      "/cuenta/pedidos/order_1/",
      "/_actions/cart.add/",
    ]) {
      expect(isPrivatePath(p), p).toBe(true);
    }
  });

  it("rutas públicas (catálogo, búsqueda, islands con su propia cabecera)", () => {
    for (const p of [
      "/",
      "/productos/",
      "/producto/x/",
      "/buscar/",
      "/cuentas-claras/",
      "/carritos/",
      "/_server-islands/CartCount/",
    ]) {
      expect(isPrivatePath(p), p).toBe(false);
    }
  });
});
