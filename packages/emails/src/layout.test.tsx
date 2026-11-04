import { render } from "react-email";
import { describe, expect, it } from "vitest";
import { Layout } from "./_components/Layout";

const links = { storefrontUrl: "https://tienda.es", assetsUrl: "https://tienda.es" };

describe("Layout: pie de baja de los emails comerciales (Fase MK-A)", () => {
  it("con `unsubscribe`: motivo, enlace de baja y enlace a Comunicaciones", async () => {
    const el = (
      <Layout
        {...links}
        preview="x"
        unsubscribe={{ url: "https://tienda.es/baja/?t=abc", topic: "Novedades y ofertas" }}
      >
        Hola
      </Layout>
    );
    const html = await render(el);
    const text = await render(el, { plainText: true });
    expect(text).toContain("activaste «Novedades y ofertas»");
    expect(html).toContain('href="https://tienda.es/baja/?t=abc"');
    expect(html).toContain('href="https://tienda.es/cuenta/comunicaciones/"');
  });

  it("sin `unsubscribe` (emails de pedido y cuenta): no hay pie de baja", async () => {
    const text = await render(
      <Layout {...links} preview="x">
        Hola
      </Layout>,
      { plainText: true },
    );
    expect(text).not.toContain("Darme de baja");
  });
});
