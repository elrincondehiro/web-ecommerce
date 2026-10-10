import {
  CART_CLEANUP_DEFAULT_DAYS,
  cleanupDays,
  cutoffDate,
  isStale,
  lastActivity,
} from "../stale-carts";

const now = new Date("2026-01-31T12:00:00.000Z");
const cutoff = cutoffDate(now, 5); // 2026-01-26T12:00Z

describe("cleanupDays", () => {
  it("acepta enteros ≥ 1", () => {
    expect(cleanupDays("5")).toBe(5);
    expect(cleanupDays("30")).toBe(30);
  });

  it("cualquier otro valor usa el de por defecto", () => {
    for (const raw of [undefined, "", "0", "-3", "2.5", "abc"]) {
      expect(cleanupDays(raw)).toBe(CART_CLEANUP_DEFAULT_DAYS);
    }
  });
});

describe("cutoffDate", () => {
  it("resta los días", () => {
    expect(cutoffDate(now, 5).toISOString()).toBe("2026-01-26T12:00:00.000Z");
  });
});

describe("lastActivity", () => {
  it("toma la fecha más reciente entre el carrito y sus líneas", () => {
    const cart = {
      id: "cart_1",
      updated_at: "2026-01-01T00:00:00.000Z",
      items: [
        { created_at: "2026-01-02T00:00:00.000Z", updated_at: "2026-01-03T00:00:00.000Z" },
        null,
        { created_at: "2026-01-04T00:00:00.000Z", updated_at: null },
      ],
    };
    expect(lastActivity(cart)).toBe(Date.parse("2026-01-04T00:00:00.000Z"));
  });

  it("sin líneas, la del carrito", () => {
    expect(lastActivity({ id: "c", updated_at: new Date("2026-01-01T00:00:00.000Z") })).toBe(
      Date.parse("2026-01-01T00:00:00.000Z"),
    );
  });
});

describe("isStale", () => {
  const old = "2026-01-10T00:00:00.000Z";
  const recent = "2026-01-30T00:00:00.000Z";

  it("viejo, sin líneas recientes ni pedido → se borra", () => {
    expect(isStale({ id: "c", updated_at: old, items: [{ updated_at: old }] }, cutoff)).toBe(true);
  });

  it("con una línea reciente → se conserva", () => {
    expect(isStale({ id: "c", updated_at: old, items: [{ updated_at: recent }] }, cutoff)).toBe(
      false,
    );
  });

  it("reciente → se conserva", () => {
    expect(isStale({ id: "c", updated_at: recent }, cutoff)).toBe(false);
  });

  it("con pedido enlazado → se conserva", () => {
    expect(isStale({ id: "c", updated_at: old, order: { id: "order_1" } }, cutoff)).toBe(false);
    expect(isStale({ id: "c", updated_at: old, order: [{ id: "order_1" }] }, cutoff)).toBe(false);
    expect(isStale({ id: "c", updated_at: old, order: null }, cutoff)).toBe(true);
  });

  it("sin fecha → se conserva", () => {
    expect(isStale({ id: "c", updated_at: null }, cutoff)).toBe(false);
  });
});
