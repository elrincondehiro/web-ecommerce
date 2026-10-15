import { describe, expect, it } from "vitest";
import { amountInputValue, parsePointsAmount, pointsUsed, transactionLabel } from "./points";

describe("puntos (L-3)", () => {
  it("concepto del movimiento con el número de pedido", () => {
    expect(transactionLabel({ reference: "order", order_display_id: 123 })).toBe(
      "Puntos del pedido #123",
    );
    expect(transactionLabel({ reference: "order_redeem", order_display_id: 7 })).toBe(
      "Usados en el pedido #7",
    );
    expect(transactionLabel({ reference: "adjustment", order_display_id: null })).toBe("Ajuste");
    expect(transactionLabel({ reference: "otra", order_display_id: null })).toBe("Movimiento");
  });

  it("descuento de puntos = ajustes PTS- (no otros descuentos)", () => {
    expect(
      pointsUsed([
        {
          adjustments: [
            { code: "PTS-AB", amount: 1.1 },
            { code: "VERANO", amount: 5 },
          ],
        },
        { adjustments: [{ code: "PTS-AB", amount: 0.2 }] },
        { adjustments: null },
        null,
      ]),
    ).toBe(1.3);
    expect(pointsUsed(undefined)).toBe(0);
  });

  it("importe del formulario: coma o punto, 2 decimales, > 0", () => {
    expect(parsePointsAmount("2,50")).toBe(2.5);
    expect(parsePointsAmount(" 3.1 ")).toBe(3.1);
    expect(parsePointsAmount("0")).toBeNull();
    expect(parsePointsAmount("1,234")).toBeNull();
    expect(parsePointsAmount("-1")).toBeNull();
    expect(parsePointsAmount("abc")).toBeNull();
    expect(parsePointsAmount(null)).toBeNull();
    expect(amountInputValue(4.2)).toBe("4,20");
  });
});
