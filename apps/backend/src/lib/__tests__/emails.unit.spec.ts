import {
  buildOrderPlacedProps,
  buildOrderShippedProps,
  emailLinks,
  minutesUntil,
  orderTaxLines,
  resetUrl,
  toNumber,
  verifyUrl,
  type OrderLike,
} from "../emails";

const links = { storefrontUrl: "https://tienda.test", assetsUrl: "https://tienda.test" };

/** Pedido como lo devuelve Query (importes BigNumber-like con valueOf). */
const big = (n: number) => ({ valueOf: () => n, toJSON: () => n });
const order: OrderLike = {
  id: "order_1",
  display_id: 7,
  email: "cliente@example.com",
  created_at: "2026-10-09T10:00:00.000Z",
  currency_code: "eur",
  total: big(61.05),
  tax_total: big(6.36),
  item_total: big(56.1),
  shipping_total: big(4.95),
  discount_total: big(0),
  items: [
    {
      id: "item_a",
      product_title: "Collar",
      variant_title: "M / Azul",
      quantity: big(1),
      unit_price: big(24.9),
      total: big(24.9),
      tax_total: big(4.32),
      thumbnail: "https://img.test/a.jpg",
      tax_lines: [{ rate: 21 }],
    },
    {
      id: "item_b",
      product_title: "Libro",
      variant_title: "Default variant",
      quantity: big(2),
      unit_price: big(15.6),
      total: big(31.2),
      tax_total: big(1.2),
      thumbnail: "/local.jpg",
      tax_lines: [{ rate: 4 }],
    },
  ],
  shipping_methods: [
    { name: "Estándar", total: big(4.95), tax_total: big(0.86), tax_lines: [{ rate: 21 }] },
  ],
  shipping_address: {
    first_name: "Lucía",
    last_name: "Martínez",
    address_1: "Calle Mayor 12",
    postal_code: "28013",
    city: "Madrid",
    province: "Madrid",
    country_code: "es",
  },
};

describe("emails: datos de Medusa → props", () => {
  it("toNumber acepta number, string y BigNumber", () => {
    expect(toNumber(4.95)).toBe(4.95);
    expect(toNumber("4.95")).toBe(4.95);
    expect(toNumber(big(4.95))).toBe(4.95);
    expect(toNumber(null)).toBe(0);
  });

  it("pedido: totales, IVA por tipo (productos + envío) y dirección", () => {
    const p = buildOrderPlacedProps(order, links);
    expect(p.displayId).toBe(7);
    expect(p.customerName).toBe("Lucía");
    expect(p.total).toBe(61.05);
    expect(p.shippingMethod).toBe("Estándar");
    expect(p.taxBreakdown).toEqual([
      { rate: 21, base: 24.67, tax: 5.18 },
      { rate: 4, base: 30, tax: 1.2 },
    ]);
    expect(p.items[0]).toMatchObject({
      title: "Collar",
      variant: "M / Azul",
      thumbnail: "https://img.test/a.jpg",
    });
    // "Default variant" no se muestra; miniatura relativa descartada (el email necesita URL absoluta)
    expect(p.items[1]).toMatchObject({ variant: null, thumbnail: null, quantity: 2 });
    expect(p.shippingAddress).toMatchObject({ name: "Lucía Martínez", country: "España" });
    expect(p.orderUrl).toBeNull();
  });

  it("pedido de un cliente con cuenta: enlace a /cuenta/pedidos/<id>/", () => {
    const p = buildOrderPlacedProps({ ...order, customer: { has_account: true } }, links);
    expect(p.orderUrl).toBe(`${links.storefrontUrl}/cuenta/pedidos/${order.id}/`);
    const guest = buildOrderPlacedProps({ ...order, customer: { has_account: false } }, links);
    expect(guest.orderUrl).toBeNull();
  });

  it("IVA: suma los tax_lines de cada línea", () => {
    expect(orderTaxLines(order).map((l) => l.rate)).toEqual([21, 4, 21]);
  });

  it("envío: solo las líneas del fulfillment, cantidades parciales y seguimiento válido", () => {
    const p = buildOrderShippedProps(
      order,
      {
        id: "ful_1",
        items: [{ line_item_id: "item_b", quantity: big(1) }],
        labels: [
          { tracking_number: "PK1", tracking_url: "https://correos.test/PK1" },
          { tracking_number: "PK2", tracking_url: "javascript:alert(1)" },
          { tracking_number: "-", tracking_url: "" },
        ],
      },
      links,
    );
    expect(p.items).toHaveLength(1);
    expect(p.items[0]).toMatchObject({ title: "Libro", quantity: 1, total: 15.6 });
    expect(p.tracking).toEqual([
      { number: "PK1", url: "https://correos.test/PK1" },
      { number: "PK2", url: null },
    ]);
  });

  it("enlaces: sin barra final y assets por defecto = storefront", () => {
    expect(emailLinks("https://tienda.test/", undefined)).toEqual(links);
    expect(emailLinks(undefined, "https://cdn.test/")).toEqual({
      storefrontUrl: "http://localhost:4321",
      assetsUrl: "https://cdn.test",
    });
  });

  it("reset: cliente al storefront, admin al Admin; token codificado", () => {
    const urls = {
      storefrontUrl: "https://tienda.test",
      backendUrl: "https://api.test",
      adminPath: "/app",
    };
    expect(resetUrl("customer", "a.b+c", urls)).toBe(
      "https://tienda.test/cuenta/restablecer/?token=a.b%2Bc",
    );
    expect(resetUrl("user", "tok", urls)).toBe("https://api.test/app/reset-password?token=tok");
  });

  it("verificación: solo el código en la URL", () => {
    expect(verifyUrl("https://tienda.test", "abc")).toBe(
      "https://tienda.test/cuenta/verificar/?token=abc",
    );
  });

  it("minutesUntil", () => {
    const now = new Date("2026-10-09T10:00:00Z");
    expect(minutesUntil("2026-10-09T10:15:00Z", now)).toBe(15);
    expect(minutesUntil(undefined, now)).toBe(15);
    expect(minutesUntil("2026-10-09T09:00:00Z", now)).toBe(15);
  });
});
