import {
  adminOrderUrl,
  buildOrderReceivedShopProps,
  ntfyOrderMessage,
  orderUnits,
  shopPets,
} from "../shop-notify";

const links = {
  storefrontUrl: "https://tienda.example.com",
  assetsUrl: "https://tienda.example.com",
};

describe("aviso de pedido nuevo (Fase M)", () => {
  it("mascotas: solo vivas, con resumen, alimentación y salud", () => {
    const pets = shopPets(
      [
        {
          name: "Hiro",
          species: "perro",
          breed: "Border collie",
          birth_year: 2021,
          birth_month: 3,
          sex: "macho",
          neutered: "si",
          weight_kg: 18.5,
          diet: "Pienso",
          health: "Alergia al pollo",
        },
        { name: "Pico", species: "otro", species_other: "Cobaya" },
        { name: "Luna", species: "gato", death_year: 2023 },
      ],
      new Date(2026, 9, 24),
    );
    expect(pets).toEqual([
      {
        name: "Hiro",
        summary:
          "Perro · Border collie · 5 años y 7 meses (aprox.) · macho · esterilizado/a · 18,5 kg",
        diet: "Pienso",
        health: "Alergia al pollo",
      },
      { name: "Pico", summary: "Cobaya", diet: null, health: null },
    ]);
  });

  it("enlace al Admin", () => {
    expect(adminOrderUrl("https://admin.example.com/", "order_1")).toBe(
      "https://admin.example.com/app/orders/order_1",
    );
    expect(adminOrderUrl(undefined, "order_1")).toBeNull();
    expect(adminOrderUrl("admin.example.com", "order_1")).toBeNull();
  });

  it("props del email: total, descuentos en una línea y datos del cliente", () => {
    const props = buildOrderReceivedShopProps(
      {
        id: "order_1",
        display_id: 7,
        email: "ana@example.com",
        currency_code: "eur",
        total: 30,
        shipping_total: 4.95,
        discount_total: 2.95,
        items: [
          {
            product_title: "Collar",
            quantity: 2,
            unit_price: 14,
            total: 25.05,
            original_total: 28,
            adjustments: [{ code: "HIRO10", amount: 2.95 }],
          },
        ],
        customer: { has_account: true },
      },
      [],
      links,
      null,
    );
    expect(props).toMatchObject({
      displayId: 7,
      total: 30,
      customerEmail: "ana@example.com",
      hasAccount: true,
      discounts: "Código HIRO10 −2,95\u00a0€",
      pets: [],
    });
    expect(props.items[0]!.total).toBe(25.05);
    expect(orderUnits(props)).toBe(2);
  });

  it("ntfy: sin datos personales, con prioridad, etiqueta y enlace; sin config no hay push", () => {
    const order = { displayId: 1042, total: 45.9, currencyCode: "eur", units: 3 };
    const msg = ntfyOrderMessage(
      { url: "https://ntfy.sh/", topic: "tema-secreto", token: "tk" },
      order,
      "https://admin.example.com/app/orders/order_1",
    );
    expect(msg).toEqual({
      url: "https://ntfy.sh/tema-secreto",
      headers: {
        Title: "Pedido nuevo n. 1042",
        Priority: "high",
        Tags: "shopping_cart",
        Click: "https://admin.example.com/app/orders/order_1",
        Authorization: "Bearer tk",
      },
      body: "Pedido n.º 1042 · 45,90\u00a0€ · 3 artículos",
    });
    // Cabeceras en ASCII (fetch rechaza otros caracteres).
    for (const v of Object.values(msg!.headers)) expect(v).toMatch(/^[\x20-\x7e]*$/);
    expect(ntfyOrderMessage({ url: "https://ntfy.sh" }, order, null)).toBeNull();
    expect(ntfyOrderMessage({ topic: "x" }, order, null)).toBeNull();
    expect(
      ntfyOrderMessage({ url: "https://ntfy.sh", topic: "x" }, order, null)?.headers,
    ).not.toHaveProperty("Click");
  });
});
