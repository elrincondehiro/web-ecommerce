import {
  accrualBase,
  balanceOf,
  consolidateDays,
  floorCents,
  isConsolidated,
  isPointsPromoCode,
  maxRedeemable,
  pointsDiscount,
  pointsFor,
  redeemedForReturned,
  refundRedeemedOnReturn,
} from "../points";

const DAY = 24 * 60 * 60 * 1000;

describe("puntos: cálculo", () => {
  it("0,8 % al céntimo hacia abajo (P4)", () => {
    expect(pointsFor(30)).toBe(0.24);
    expect(pointsFor(100)).toBe(0.8);
    expect(pointsFor(12.49)).toBe(0.09); // 0,09992
    expect(pointsFor(1.24)).toBe(0); // 0,00992
    expect(pointsFor(0)).toBe(0);
    expect(pointsFor(-5)).toBe(0);
    expect(floorCents(0.2999)).toBe(0.29);
    expect(pointsFor(36.25)).toBe(0.29); // 0,29 exacto (36,25 × 0,008 = 0,28999… en coma flotante)
    expect(floorCents(0.1 + 0.2)).toBe(0.3); // coma flotante
  });

  it("base: líneas con IVA tras descuentos, sin productos que no generan ni lo devuelto", () => {
    const items = [
      { total: 20 },
      { total: { valueOf: () => 10.5 } },
      { total: 50, product: { metadata: { genera_puntos: false } } },
      { total: 5, variant: { product: { metadata: { genera_puntos: false } } } },
      null,
    ];
    expect(accrualBase(items)).toBe(30.5);
    expect(accrualBase(items, 10)).toBe(20.5);
    expect(accrualBase(items, 100)).toBe(0);
  });

  it("saldo = abonos − cargos", () => {
    expect(
      balanceOf([
        { type: "credit", amount: 1.2 },
        { type: "credit", amount: 0.24 },
        { type: "debit", amount: 1 },
      ]),
    ).toBe(0.44);
    expect(balanceOf([])).toBe(0);
  });

  it("días de consolidación: entero ≥ 0 o 14", () => {
    expect(consolidateDays(undefined)).toBe(14);
    expect(consolidateDays("")).toBe(14);
    expect(consolidateDays("x")).toBe(14);
    expect(consolidateDays("-1")).toBe(14);
    expect(consolidateDays("0")).toBe(0);
    expect(consolidateDays("30")).toBe(30);
  });
});

describe("puntos: consolidación (P1: 14 días desde el último envío)", () => {
  const now = new Date("2026-10-30T12:00:00Z");
  const ago = (d: number) => new Date(now.getTime() - d * DAY);

  it("enviado hace 14 días o más → sí; menos → no", () => {
    expect(isConsolidated({ fulfillments: [{ shipped_at: ago(14) }] }, now, 14)).toBe(true);
    expect(isConsolidated({ fulfillments: [{ shipped_at: ago(13) }] }, now, 14)).toBe(false);
  });

  it("cuenta el ÚLTIMO envío; ignora envíos cancelados; sin envío → no", () => {
    const fs = [{ shipped_at: ago(20) }, { shipped_at: ago(5) }];
    expect(isConsolidated({ fulfillments: fs }, now, 14)).toBe(false);
    const canceled = [{ shipped_at: ago(20) }, { shipped_at: ago(5), canceled_at: ago(4) }];
    expect(isConsolidated({ fulfillments: canceled }, now, 14)).toBe(true);
    expect(isConsolidated({ fulfillments: [] }, now, 14)).toBe(false);
    expect(isConsolidated({ fulfillments: [{ shipped_at: null }] }, now, 14)).toBe(false);
  });

  it("pedido cancelado → nunca", () => {
    const f = [{ shipped_at: ago(30) }];
    expect(isConsolidated({ status: "canceled", fulfillments: f }, now, 14)).toBe(false);
    expect(isConsolidated({ canceled_at: ago(1), fulfillments: f }, now, 14)).toBe(false);
  });
});

describe("puntos: canje", () => {
  it("tope: saldo, productos y ≥ 0,50 € por pagar contando el envío", () => {
    expect(maxRedeemable(5, 100, 4.95)).toBe(5);
    expect(maxRedeemable(500, 100, 4.95)).toBe(100); // el envío ya cubre los 0,50 €
    expect(maxRedeemable(500, 100, 0)).toBe(99.5); // sin envío: quedan 0,50 €
    expect(maxRedeemable(500, 100, 0.2)).toBe(99.7);
    expect(maxRedeemable(500, 0.4, 0)).toBe(0);
    expect(maxRedeemable(0, 100, 0)).toBe(0);
    expect(maxRedeemable(1.239, 100, 5)).toBe(1.23);
  });

  it("código y descuento real de la promoción de puntos", () => {
    expect(isPointsPromoCode("PTS-01ABC")).toBe(true);
    expect(isPointsPromoCode("VERANO")).toBe(false);
    expect(isPointsPromoCode(null)).toBe(false);
    const items = [
      {
        adjustments: [
          { code: "PTS-1", amount: 0.64 },
          { code: "VERANO", amount: 2 },
        ],
      },
      { adjustments: [{ code: "PTS-1", amount: { valueOf: () => 3.29 } }] },
      { adjustments: null },
    ];
    expect(pointsDiscount(items)).toEqual({ code: "PTS-1", amount: 3.93 });
    expect(pointsDiscount([])).toEqual({ code: null, amount: 0 });
  });
});

describe("ajustes versionados del pedido (fase 13)", () => {
  it("de cada línea solo cuenta la última versión (Query devuelve todas)", () => {
    const items = [
      {
        adjustments: [
          { code: "PTS-1", amount: 7, version: 1 },
          { code: "PTS-1", amount: 7, version: 2 },
        ],
      },
      {
        adjustments: [
          { code: "PTS-1", amount: 3, version: 1 },
          { code: "PTS-1", amount: 3, version: 2 },
        ],
      },
    ];
    expect(pointsDiscount(items)).toEqual({ code: "PTS-1", amount: 10 });
    // Sin versión (carrito o una sola): todas
    expect(pointsDiscount([{ adjustments: [{ code: "PTS-1", amount: 2 }] }]).amount).toBe(2);
  });
});

describe("devolución de lo canjeado (fase 13, P2)", () => {
  // 10 € canjeados en 150 € de productos: el descuento se reparte por línea (Medusa).
  const line = (qty: number, received: number, points: number) => ({
    quantity: qty,
    detail: { return_received_quantity: received },
    adjustments: [{ code: "PTS-1", amount: points }],
  });

  it("proporcional a lo recibido; al céntimo hacia abajo", () => {
    // Medusa reparte el descuento por línea al céntimo: 70 € → 4,67 y 80 € → 5,33
    expect(redeemedForReturned([line(1, 1, 4.67), line(1, 0, 5.33)])).toBe(4.67);
    // 3 unidades con 10 € de puntos, devuelta 1 → 3,33 (hacia abajo)
    expect(redeemedForReturned([line(3, 1, 10)])).toBe(3.33);
    // Mitad de una línea de 2 unidades
    expect(redeemedForReturned([line(2, 1, 3), line(1, 0, 7)])).toBe(1.5);
  });

  it("todo devuelto → todo lo canjeado; nada devuelto o sin puntos → 0", () => {
    expect(redeemedForReturned([line(1, 1, 4.67), line(1, 1, 5.33)])).toBe(10);
    expect(redeemedForReturned([line(1, 0, 10)])).toBe(0);
    expect(
      redeemedForReturned([
        { quantity: 1, detail: { return_received_quantity: 1 }, adjustments: [] },
      ]),
    ).toBe(0);
    expect(redeemedForReturned(null)).toBe(0);
  });

  it("interruptor POINTS_REFUND_REDEEMED_ON_RETURN: activo salvo «false»", () => {
    expect(refundRedeemedOnReturn(undefined)).toBe(true);
    expect(refundRedeemedOnReturn("true")).toBe(true);
    expect(refundRedeemedOnReturn("false")).toBe(false);
  });
});
