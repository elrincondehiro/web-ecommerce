import { describe, expect, it } from "vitest";
import { umamiClean } from "./analytics";

const O = "https://tienda.example";
const url = (u: string) => umamiClean({ url: u, title: "T" }, O);

describe("filtro de Umami (Fase MK-E)", () => {
  it("solo q y utm_*; sin tokens ni #", () => {
    expect(url(`${O}/buscar/?q=pienso&pagina=2&utm_source=news#x`).url).toBe(
      `${O}/buscar/?q=pienso&utm_source=news`,
    );
    expect(url(`${O}/cuenta/verificar/?token=abc.def`).url).toBe(`${O}/cuenta/verificar/`);
    expect(url(`${O}/baja/?t=xyz`).url).toBe(`${O}/baja/`);
    expect(url(`${O}/producto/x/#carrito-added`)).toEqual({ url: `${O}/producto/x/`, title: "T" });
  });
  it("ids y tokens de la ruta → :id, también en el título", () => {
    expect(url(`${O}/pedido/order_01ABC/`)).toEqual({
      url: `${O}/pedido/:id/`,
      title: "/pedido/:id/",
    });
    expect(url(`${O}/deseos/Tk-123/`).url).toBe(`${O}/deseos/:id/`);
    expect(url(`${O}/cuenta/pedidos/order_1/`).url).toBe(`${O}/cuenta/pedidos/:id/`);
    expect(url(`${O}/cuenta/pedidos/`)).toEqual({ url: `${O}/cuenta/pedidos/`, title: "T" });
    expect(url(`${O}/cuenta/mascotas/pet_1/`).url).toBe(`${O}/cuenta/mascotas/:id/`);
    expect(url(`${O}/cuenta/mascotas/nueva/`).url).toBe(`${O}/cuenta/mascotas/nueva/`);
  });
  it("referencia propia limpia y externa solo el origen; el resto igual", () => {
    expect(
      umamiClean({ referrer: "/cuenta/restablecer/?token=s", website: "w", screen: "1x1" }, O),
    ).toEqual({ referrer: "/cuenta/restablecer/", website: "w", screen: "1x1" });
    expect(umamiClean({ referrer: "https://l.instagram.com/?u=perfil" }, O).referrer).toBe(
      "https://l.instagram.com",
    );
  });
});
