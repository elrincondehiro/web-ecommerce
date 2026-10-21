import {
  AUTO_TRANSFER,
  earnsPoints,
  isAutoTransfer,
  linkedMeta,
  lookbackDays,
  maskEmail,
  normalizeEmail,
  retroactiveEnabled,
  transferTtlDays,
} from "../guest-orders";

describe("pedidos de invitado → cuenta (Fase G)", () => {
  it("POINTS_RETROACTIVE: activado salvo false/0/no/off", () => {
    expect(retroactiveEnabled(undefined)).toBe(true);
    expect(retroactiveEnabled("")).toBe(true);
    expect(retroactiveEnabled("true")).toBe(true);
    for (const off of ["false", "FALSE", " 0 ", "no", "off"]) {
      expect(retroactiveEnabled(off)).toBe(false);
    }
  });

  it("POINTS_ACCRUE_LOOKBACK_DAYS: entero 1–3650, si no 120", () => {
    expect(lookbackDays(undefined)).toBe(120);
    expect(lookbackDays("")).toBe(120);
    expect(lookbackDays("365")).toBe(365);
    expect(lookbackDays("30")).toBe(30);
    expect(lookbackDays("0")).toBe(120);
    expect(lookbackDays("1.5")).toBe(120);
    expect(lookbackDays("9999")).toBe(120);
    expect(lookbackDays("abc")).toBe(120);
  });

  it("sin retroactivos: solo dan puntos los pedidos desde la creación de la cuenta", () => {
    const account = { created_at: "2026-10-10T10:00:00Z" };
    const before = { created_at: "2026-10-01T10:00:00Z" };
    const after = { created_at: "2026-10-12T10:00:00Z" };
    expect(earnsPoints(before, account, true)).toBe(true);
    expect(earnsPoints(before, account, false)).toBe(false);
    expect(earnsPoints(after, account, false)).toBe(true);
    expect(earnsPoints(account, account, false)).toBe(true);
    // Sin fechas: no se bloquea
    expect(earnsPoints({}, account, false)).toBe(true);
    expect(earnsPoints(before, null, false)).toBe(true);
  });

  it("transferencias automáticas y marca del pedido", () => {
    expect(isAutoTransfer(AUTO_TRANSFER.sameEmail)).toBe(true);
    expect(isAutoTransfer(AUTO_TRANSFER.manual)).toBe(true);
    expect(isAutoTransfer("Reclamado por el cliente")).toBe(false);
    expect(isAutoTransfer(null)).toBe(false);
    expect(
      linkedMeta({ cuenta_vinculada: { at: "2026-10-21", reason: "auto:mismo-email" } }),
    ).toEqual({ at: "2026-10-21", reason: "auto:mismo-email" });
    expect(linkedMeta({ cuenta_vinculada: "x" })).toBeNull();
    expect(linkedMeta(null)).toBeNull();
  });

  it("email normalizado como Medusa (minúsculas, sin espacios)", () => {
    expect(normalizeEmail(" Ana@Example.COM ")).toBe("ana@example.com");
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail("sin-arroba")).toBeNull();
  });

  it("ORDER_TRANSFER_TTL_DAYS: entero 1–60, si no 7", () => {
    expect(transferTtlDays(undefined)).toBe(7);
    expect(transferTtlDays("3")).toBe(3);
    expect(transferTtlDays("0")).toBe(7);
    expect(transferTtlDays("61")).toBe(7);
    expect(transferTtlDays("x")).toBe(7);
  });

  it("email enmascarado (aviso al dueño del pedido)", () => {
    expect(maskEmail("Juan.Perez@Gmail.com")).toBe("j***@gmail.com");
    expect(maskEmail("a@b.es")).toBe("a***@b.es");
    expect(maskEmail(null)).toBe("una cuenta");
  });
});
