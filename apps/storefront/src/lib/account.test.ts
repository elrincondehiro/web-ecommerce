import { describe, expect, it } from "vitest";
import {
  ACCOUNT_PATH,
  SESSION_MAX_AGE,
  checkPassword,
  decodeAccountFlash,
  defaultAddress,
  encodeAccountFlash,
  isIdentityExists,
  isSessionToken,
  loginRedirect,
  orderStatusLabel,
  parseDeleteForm,
  parseLoginForm,
  parseProfileForm,
  parseRegisterForm,
  parseResetForm,
  parseSavedAddressForm,
  readToken,
  safeNext,
  sameAddress,
  tokenMaxAge,
} from "./account";

const form = (data: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(data)) f.set(k, v);
  return f;
};

/** JWT sin firma válida (solo el payload importa aquí). */
const jwt = (payload: Record<string, unknown>) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.firma`;

describe("token", () => {
  const now = Date.UTC(2026, 9, 9);
  const exp = Math.floor(now / 1000) + 3600;

  it("lee actor_id y exp de un token de cliente", () => {
    expect(readToken(jwt({ actor_id: "cus_1", actor_type: "customer", exp }))).toEqual({
      actorId: "cus_1",
      exp,
    });
  });

  it("rechaza tokens de otro actor o mal formados", () => {
    expect(readToken(jwt({ actor_id: "user_1", actor_type: "user", exp }))).toBeNull();
    expect(readToken("no.es.jwt")).toBeNull();
    expect(readToken("")).toBeNull();
    expect(readToken(undefined)).toBeNull();
  });

  it("sesión = cliente creado y sin caducar", () => {
    expect(isSessionToken({ actorId: "cus_1", exp }, now)).toBe(true);
    expect(isSessionToken({ actorId: "", exp }, now)).toBe(false); // falta crear el cliente
    expect(isSessionToken({ actorId: "cus_1", exp: exp - 7200 }, now)).toBe(false);
    expect(isSessionToken(null, now)).toBe(false);
  });

  it("la cookie dura lo que le queda al token (máx. 7 días)", () => {
    expect(tokenMaxAge({ actorId: "cus_1", exp }, now)).toBe(3600);
    expect(tokenMaxAge({ actorId: "cus_1", exp: exp + 30 * 86400 }, now)).toBe(SESSION_MAX_AGE);
    expect(tokenMaxAge({ actorId: "cus_1", exp: 1 }, now)).toBe(0);
  });
});

describe("redirecciones", () => {
  it("safeNext solo admite rutas propias", () => {
    expect(safeNext("/checkout/")).toBe("/checkout/");
    expect(safeNext("/cuenta/pedidos/?pagina=2")).toBe("/cuenta/pedidos/?pagina=2");
    expect(safeNext("//evil.test/")).toBe(ACCOUNT_PATH);
    expect(safeNext("/\\evil.test")).toBe(ACCOUNT_PATH);
    expect(safeNext("https://evil.test/")).toBe(ACCOUNT_PATH);
    expect(safeNext("javascript:alert(1)")).toBe(ACCOUNT_PATH);
    expect(safeNext("/cuenta/entrar/")).toBe(ACCOUNT_PATH);
    expect(safeNext(null)).toBe(ACCOUNT_PATH);
  });

  it("loginRedirect añade ?next= salvo para /cuenta/", () => {
    expect(loginRedirect()).toBe("/cuenta/entrar/");
    expect(loginRedirect("/cuenta/")).toBe("/cuenta/entrar/");
    expect(loginRedirect("/cuenta/datos/")).toBe("/cuenta/entrar/?next=%2Fcuenta%2Fdatos%2F");
  });
});

describe("flash", () => {
  it("ida y vuelta; ignora códigos desconocidos y datos raros", () => {
    const raw = encodeAccountFlash({ code: "saved", errors: { a: "x" }, values: { b: "y" } });
    expect(decodeAccountFlash(raw)).toEqual({
      code: "saved",
      errors: { a: "x" },
      values: { b: "y" },
    });
    expect(decodeAccountFlash('{"code":"hack","values":{"a":1}}')).toEqual({ values: {} });
    expect(decodeAccountFlash("no-json")).toEqual({});
    expect(decodeAccountFlash(undefined)).toEqual({});
  });
});

describe("formularios", () => {
  it("contraseña: 8+ caracteres con letras y números", () => {
    expect(checkPassword("corta1")).toMatch(/Mínimo/);
    expect(checkPassword("soloLetras")).toMatch(/letra y un número/);
    expect(checkPassword("12345678")).toMatch(/letra y un número/);
    expect(checkPassword("Secreta-123")).toBeNull();
  });

  it("registro: email normalizado, condiciones obligatorias y sin devolver la contraseña", () => {
    const ok = parseRegisterForm(
      form({ email: " Ana@Example.COM ", password: "Secreta-123", terms: "on" }),
    );
    expect(ok).toEqual({ ok: true, data: { email: "ana@example.com", password: "Secreta-123" } });
    const ko = parseRegisterForm(form({ email: "mal", password: "x" }));
    expect(ko.ok).toBe(false);
    if (!ko.ok) {
      expect(Object.keys(ko.errors).sort()).toEqual(["email", "password", "terms"]);
      expect(ko.values).toEqual({ email: "mal" });
    }
  });

  it("entrar: no aplica reglas de complejidad", () => {
    expect(parseLoginForm(form({ email: "a@b.es", password: "x" })).ok).toBe(true);
    expect(parseLoginForm(form({ email: "a@b.es", password: "" })).ok).toBe(false);
  });

  it("restablecer: contraseñas iguales y token presente", () => {
    expect(
      parseResetForm(
        form({ token: "t", password: "Secreta-123", password_confirm: "Secreta-123" }),
      ),
    ).toEqual({ ok: true, data: { token: "t", password: "Secreta-123" } });
    const distintas = parseResetForm(
      form({ token: "t", password: "Secreta-123", password_confirm: "Otra-1234" }),
    );
    expect(!distintas.ok && distintas.errors.password_confirm).toBeTruthy();
    const sinToken = parseResetForm(
      form({ password: "Secreta-123", password_confirm: "Secreta-123" }),
    );
    expect(!sinToken.ok && sinToken.errors.token).toBeTruthy();
  });

  it("mis datos: teléfono opcional pero válido", () => {
    expect(parseProfileForm(form({ first_name: "Ana", last_name: "Pérez", phone: "" }))).toEqual({
      ok: true,
      data: { first_name: "Ana", last_name: "Pérez", phone: "" },
    });
    expect(
      parseProfileForm(form({ first_name: "Ana", last_name: "Pérez", phone: "600 123 456" })),
    ).toEqual({
      ok: true,
      data: { first_name: "Ana", last_name: "Pérez", phone: "+34600123456" },
    });
    const ko = parseProfileForm(form({ first_name: "", last_name: "Pérez", phone: "123" }));
    expect(!ko.ok && Object.keys(ko.errors).sort()).toEqual(["first_name", "phone"]);
  });

  it("dirección: CP de envío, provincia y teléfono", () => {
    const base = {
      first_name: "Ana",
      last_name: "Pérez",
      address_1: "C/ Mayor 1",
      postal_code: "28001",
      city: "Madrid",
      phone: "600123456",
    };
    const ok = parseSavedAddressForm(form({ ...base, address_name: "Casa", is_default: "on" }));
    expect(ok).toEqual({
      ok: true,
      data: {
        ...base,
        address_name: "Casa",
        address_2: "",
        province: "Madrid",
        phone: "+34600123456",
        country_code: "es",
        is_default_shipping: true,
      },
    });
    const canarias = parseSavedAddressForm(form({ ...base, postal_code: "35001" }));
    expect(!canarias.ok && canarias.errors.postal_code).toMatch(/Península y Baleares/);
  });

  it("baja: exige confirmar; motivo opcional sin caracteres de control", () => {
    expect(parseDeleteForm(form({ reason: "x" })).ok).toBe(false);
    expect(parseDeleteForm(form({ confirm: "on", reason: " Me voy\u0007 \n bye " }))).toEqual({
      ok: true,
      data: { reason: "Me voy \n bye" },
    });
    expect(parseDeleteForm(form({ confirm: "on", reason: "x".repeat(501) })).ok).toBe(false);
  });
});

describe("utilidades", () => {
  it("defaultAddress: la predeterminada o la primera", () => {
    type A = { id: number; is_default_shipping?: boolean };
    const list: A[] = [{ id: 1 }, { id: 2, is_default_shipping: true }];
    expect(defaultAddress(list)?.id).toBe(2);
    expect(defaultAddress<A>([{ id: 1 }])?.id).toBe(1);
    expect(defaultAddress<A>([])).toBeNull();
  });

  it("sameAddress ignora mayúsculas, espacios y nulos", () => {
    const a = {
      first_name: "Ana",
      last_name: "Pérez",
      address_1: "C/ Mayor  1",
      postal_code: "28001",
      city: "Madrid",
    };
    expect(sameAddress(a, { ...a, address_1: "c/ mayor 1", address_2: null })).toBe(true);
    expect(sameAddress(a, { ...a, postal_code: "28002" })).toBe(false);
  });

  it("estado del pedido", () => {
    expect(orderStatusLabel({ status: "pending", fulfillment_status: "not_fulfilled" })).toBe(
      "Recibido",
    );
    expect(orderStatusLabel({ status: "pending", fulfillment_status: "shipped" })).toBe("Enviado");
    expect(orderStatusLabel({ status: "canceled", fulfillment_status: "shipped" })).toBe(
      "Cancelado",
    );
  });

  it("isIdentityExists reconoce el error de Medusa", () => {
    expect(isIdentityExists(new Error("Identity with email already exists"))).toBe(true);
    expect(isIdentityExists(new Error("otro"))).toBe(false);
  });
});
