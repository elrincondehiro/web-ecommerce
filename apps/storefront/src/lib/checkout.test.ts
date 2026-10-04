import { describe, expect, it } from "vitest";
import {
  PROVINCES,
  SHIPPING_CP_PATTERN,
  addressDone,
  canViewOrder,
  checkShippingPostalCode,
  classifyCompleteError,
  decodeFlash,
  encodeFlash,
  lastOrderCookieOptions,
  normalizePhone,
  parseAddressForm,
  shippingDone,
  stripeSession,
} from "./checkout";

function form(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

const VALID = {
  email: " Ana@Example.com ",
  phone: "600 123 456",
  first_name: "Ana",
  last_name: "Pérez",
  address_1: "Calle Mayor 1",
  address_2: "",
  postal_code: "28001",
  city: "Madrid",
  same_billing: "on",
};

describe("checkShippingPostalCode", () => {
  it("acepta Península y Baleares con su provincia", () => {
    expect(checkShippingPostalCode("28001")).toEqual({ ok: true, province: "Madrid" });
    expect(checkShippingPostalCode("07001")).toEqual({ ok: true, province: "Illes Balears" });
  });
  it("rechaza Canarias, Ceuta, Melilla y CP inexistentes", () => {
    for (const cp of ["35001", "38001", "51001", "52001"]) {
      const r = checkShippingPostalCode(cp);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/Península y Baleares/);
    }
    expect(checkShippingPostalCode("00123").ok).toBe(false);
    expect(checkShippingPostalCode("53001").ok).toBe(false);
    expect(checkShippingPostalCode("2800").ok).toBe(false);
  });
  it("el pattern HTML coincide con la validación del servidor (01000–52999)", () => {
    const re = new RegExp(`^(?:${SHIPPING_CP_PATTERN})$`);
    for (let p = 0; p <= 60; p++) {
      const cp = `${String(p).padStart(2, "0")}123`;
      expect(re.test(cp), cp).toBe(checkShippingPostalCode(cp).ok);
    }
  });
  it("las provincias son 48 (50 menos Las Palmas y Tenerife)", () => {
    expect(Object.keys(PROVINCES)).toHaveLength(48);
  });
});

describe("normalizePhone", () => {
  it("normaliza móviles y fijos españoles a +34", () => {
    expect(normalizePhone("600 123 456")).toBe("+34600123456");
    expect(normalizePhone("+34 912-345-678")).toBe("+34912345678");
    expect(normalizePhone("0034600123456")).toBe("+34600123456");
  });
  it("acepta internacionales con + y rechaza el resto", () => {
    expect(normalizePhone("+33 6 12 34 56 78")).toBe("+33612345678");
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("500123456")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
});

describe("parseAddressForm", () => {
  it("datos válidos: email en minúsculas, facturación = envío", () => {
    const r = parseAddressForm(form(VALID));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.email).toBe("ana@example.com");
    expect(r.data.shipping).toMatchObject({
      first_name: "Ana",
      postal_code: "28001",
      province: "Madrid",
      phone: "+34600123456",
      country_code: "es",
    });
    expect(r.data.billing).toEqual(r.data.shipping);
  });

  it("errores por campo y devuelve los valores introducidos", () => {
    const r = parseAddressForm(
      form({ ...VALID, email: "no-es-email", first_name: " ", postal_code: "35001", phone: "1" }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(["email", "first_name", "phone", "postal_code"]);
    expect(r.errors.postal_code).toMatch(/Canarias/);
    expect(r.values.email).toBe("no-es-email");
  });

  it("facturación distinta: se valida aparte y admite CP de toda España", () => {
    const base = { ...VALID, same_billing: "" };
    const bad = parseAddressForm(form(base));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors).toHaveProperty("billing_first_name");

    const ok = parseAddressForm(
      form({
        ...base,
        billing_first_name: "Empresa",
        billing_last_name: "SL",
        billing_address_1: "Calle Real 2",
        billing_postal_code: "35001",
        billing_city: "Las Palmas",
      }),
    );
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.data.billing).toMatchObject({ postal_code: "35001", city: "Las Palmas" });
  });

  it("rechaza caracteres de control", () => {
    const r = parseAddressForm(form({ ...VALID, city: "Mad\u0000rid" }));
    expect(r.ok).toBe(false);
  });
});

describe("flash", () => {
  it("ida y vuelta", () => {
    const f = { code: "invalid" as const, errors: { email: "x" }, values: { email: "a" } };
    expect(decodeFlash(encodeFlash(f))).toEqual(f);
  });
  it("ignora basura sin lanzar", () => {
    expect(decodeFlash(undefined)).toEqual({});
    expect(decodeFlash("{no json")).toEqual({});
    expect(decodeFlash('{"code":"hack","errors":{"a":1}}')).toEqual({ errors: {} });
    expect(decodeFlash("x".repeat(5000))).toEqual({});
  });
});

describe("estado del checkout", () => {
  const session = (o: object) => ({
    provider_id: "pp_stripe_stripe",
    status: "pending",
    amount: 24.9,
    data: { client_secret: "pi_x_secret_y" },
    ...o,
  });

  it("addressDone / shippingDone", () => {
    expect(addressDone({})).toBe(false);
    expect(
      addressDone({ email: "a@b.es", shipping_address: { address_1: "x", postal_code: "28001" } }),
    ).toBe(true);
    expect(
      addressDone({ email: "a@b.es", shipping_address: { address_1: "x", postal_code: "38001" } }),
    ).toBe(false);
    expect(shippingDone({ shipping_methods: [{ shipping_option_id: "so_1" }] })).toBe(true);
    expect(shippingDone({ shipping_methods: [] })).toBe(false);
  });

  it("stripeSession: reutiliza la pendiente del mismo importe", () => {
    expect(
      stripeSession({ total: 24.9, payment_collection: { payment_sessions: [session({})] } }),
    ).toEqual({ state: "pending", clientSecret: "pi_x_secret_y" });
    expect(
      stripeSession({ total: 29.9, payment_collection: { payment_sessions: [session({})] } }),
    ).toEqual({ state: "none" });
    expect(stripeSession({ total: 24.9, payment_collection: null })).toEqual({ state: "none" });
    expect(
      stripeSession({
        total: 24.9,
        payment_collection: { payment_sessions: [session({ status: "authorized" })] },
      }),
    ).toEqual({ state: "authorized" });
  });
});

describe("pedido", () => {
  it("canViewOrder solo con la cookie del mismo pedido", () => {
    expect(canViewOrder("order_1", "order_1")).toBe(true);
    expect(canViewOrder("order_2", "order_1")).toBe(false);
    expect(canViewOrder(undefined, "order_1")).toBe(false);
    expect(canViewOrder("", "")).toBe(false);
  });
  it("cookie last_order: httpOnly, 1 h, solo /pedido/", () => {
    expect(lastOrderCookieOptions(true)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/pedido/",
      maxAge: 3600,
    });
  });
  it("classifyCompleteError con mensajes reales de Medusa 2.21.2", () => {
    expect(
      classifyCompleteError(new Error("Session: payses_1 was not authorized with the provider.")),
    ).toBe("payment_pending");
    expect(
      classifyCompleteError(new Error("Some variant does not have the required inventory")),
    ).toBe("stock");
    expect(
      classifyCompleteError(
        Object.assign(new Error("Cart with id 'c' not found"), { status: 404 }),
      ),
    ).toBe("expired");
    expect(classifyCompleteError(new Error("boom"))).toBe("error");
  });
});
