import { anonymizedEmail, cleanReason, isDeletePhrase, isPendingOrder } from "../account-deletion";

describe("baja de la cuenta (fase 13)", () => {
  it("frase: sin distinguir mayúsculas ni espacios de más", () => {
    expect(isDeletePhrase("eliminar mi cuenta")).toBe(true);
    expect(isDeletePhrase("  Eliminar   MI cuenta ")).toBe(true);
    expect(isDeletePhrase("eliminar cuenta")).toBe(false);
    expect(isDeletePhrase("")).toBe(false);
    expect(isDeletePhrase(null)).toBe(false);
  });

  it("pedidos en curso: algo sin enviar o una devolución abierta, sin cancelar", () => {
    const item = (quantity: number, shipped: number) => ({
      quantity,
      detail: { shipped_quantity: shipped },
    });
    expect(isPendingOrder({ status: "pending", items: [item(2, 0)] })).toBe(true);
    expect(isPendingOrder({ status: "pending", items: [item(2, 1)] })).toBe(true);
    expect(isPendingOrder({ status: "pending", items: [item(2, 2)] })).toBe(false);
    expect(isPendingOrder({ status: "canceled", items: [item(2, 0)] })).toBe(false);
    expect(isPendingOrder({ status: "pending", canceled_at: "x", items: [item(1, 0)] })).toBe(
      false,
    );
    expect(isPendingOrder({ status: "completed", items: [item(1, 0)] })).toBe(false);
    expect(
      isPendingOrder({
        status: "pending",
        items: [item(1, 1)],
        returns: [{ status: "requested" }],
      }),
    ).toBe(true);
    expect(
      isPendingOrder({ status: "pending", items: [item(1, 1)], returns: [{ status: "received" }] }),
    ).toBe(false);
  });

  it("email anónimo y motivo limpio", () => {
    expect(anonymizedEmail("cus_1")).toBe("borrado-cus_1@invalid");
    expect(cleanReason(" Me voy\u0007 \n ")).toBe("Me voy");
    expect(cleanReason("   ")).toBeNull();
    expect(cleanReason("x".repeat(600))).toHaveLength(500);
  });
});
