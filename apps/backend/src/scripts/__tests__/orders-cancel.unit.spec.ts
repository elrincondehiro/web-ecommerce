import { isTestEmail, skipReason } from "../lib/orders-cancel";

describe("orders:cancel (pedidos de prueba)", () => {
  it("solo emails @example.com exactos", () => {
    expect(isTestEmail("e2e-123@example.com")).toBe(true);
    expect(isTestEmail(" Cliente@Example.COM ")).toBe(true);
    expect(isTestEmail("alguien@gmail.com")).toBe(false);
    expect(isTestEmail("x@sub.example.com")).toBe(false);
    expect(isTestEmail("x@example.com.es")).toBe(false);
    expect(isTestEmail("x@notexample.com")).toBe(false);
    expect(isTestEmail("@example.com")).toBe(false);
    expect(isTestEmail("")).toBe(false);
    expect(isTestEmail(null)).toBe(false);
  });

  it("se salta lo que cancelOrderWorkflow rechaza", () => {
    expect(skipReason({ status: "pending" })).toBeNull();
    expect(
      skipReason({ status: "pending", fulfillments: [{ canceled_at: "2026-11-01" }] }),
    ).toBeNull();
    expect(skipReason({ status: "pending", fulfillments: [{ canceled_at: null }] })).toBe(
      "con envío",
    );
    expect(skipReason({ status: "completed" })).toBe("completado");
    expect(skipReason({ status: "canceled" })).toBe("cancelado");
    expect(skipReason({ status: "pending", canceled_at: "2026-11-01" })).toBe("cancelado");
  });
});
