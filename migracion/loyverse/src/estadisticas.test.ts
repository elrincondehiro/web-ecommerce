import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { SaleReceipt } from "./analisis.ts";
import {
  computeStats,
  localParts,
  monthRange,
  movingAverage,
  normalizePayment,
  pareto,
  pctChange,
} from "./estadisticas.ts";
import { renderReport } from "./informe.ts";

const r = (
  date: string,
  money: number,
  extra: Partial<SaleReceipt> = {},
  variant = "v1",
): SaleReceipt => ({
  receipt_number: date,
  receipt_type: "SALE",
  created_at: date,
  receipt_date: date,
  cancelled_at: null,
  total_money: money,
  total_tax: 0,
  total_discount: 0,
  line_items: [
    {
      item_id: "i",
      variant_id: variant,
      item_name: "Collar",
      variant_name: null,
      quantity: 2,
      total_money: money,
      cost_total: null,
    },
  ],
  payments: [{ name: "1. Tarjeta", type: "NONINTEGRATEDCARD", money_amount: money }],
  ...extra,
});

const products = new Map([["v1", { categoria: "Collares", articulo: "Collar" }]]);

describe("estadísticas de ventas", () => {
  it("hora de Madrid: día, hora y día de la semana", () => {
    // 2026-07-01 22:30 UTC = jueves 2 de julio, 00:30 en Madrid (verano, UTC+2)
    const p = localParts("2026-07-01T22:30:00Z");
    assert.deepEqual([p.day, p.hour, p.weekday], ["2026-07-02", 0, 3]);
  });

  it("años, mismo periodo, devoluciones, cancelados, mapa de calor y pagos", () => {
    const s = computeStats(
      [
        r("2025-03-10T10:00:00Z", 100),
        r("2025-11-10T10:00:00Z", 50), // fuera del «mismo periodo» (corte: 15 de mayo)
        r("2026-02-10T10:00:00Z", 80),
        r("2026-02-11T10:00:00Z", 10, { receipt_type: "REFUND" }),
        r("2026-02-12T10:00:00Z", 999, { cancelled_at: "2026-02-12T10:05:00Z" }),
        r("2026-05-15T10:00:00Z", 40, {}, "borrada"),
      ],
      products,
      new Date("2026-05-20T00:00:00Z"),
    );
    assert.equal(s.cutoff, "05-15");
    assert.deepEqual(s.years, [2025, 2026]);
    assert.equal(s.byYear.get(2025)!.money, 150);
    assert.equal(s.byYearToDate.get(2025)!.money, 100);
    assert.equal(s.byYear.get(2026)!.money, 110); // 80 − 10 + 40
    assert.equal(s.byYear.get(2026)!.refunds, 1);
    assert.equal(s.byYear.get(2026)!.tickets, 2);
    assert.equal(s.daysByMonth.get("2026-02"), 1);
    // Lunes 10/3/2025 10:00 UTC = 11:00 en Madrid; lunes 10/11/2025 10:00 UTC = 11:00 también
    assert.equal(s.heat[0]![11], 150);
    assert.equal(s.byCategoryYear.get("(fuera del catálogo)")!.get(2026), 40);
    assert.equal(s.payments.get("Tarjeta")!.get(2026), 110);
    // Productos: últimos 12 meses (hasta el último ticket) frente a los 12 anteriores
    const collar = s.products.get("Collares|Collar")!;
    assert.equal(collar.last12, 120); // 50 (nov 25) + 80 − 10
    assert.equal(collar.prev12, 100);
  });

  it("utilidades", () => {
    assert.deepEqual(monthRange("2025-11", "2026-02"), [
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
    assert.deepEqual(movingAverage([1, 2, 3, 4], 3), [null, null, 2, 3]);
    assert.equal(pctChange(120, 100), 20);
    assert.equal(pctChange(5, 0), null);
    assert.deepEqual(pareto([50, 30, 10, 10, 0, -5]), { products: 4, top: 2, total: 100 });
    assert.equal(normalizePayment("1. Tarjeta"), "Tarjeta");
    assert.equal(normalizePayment(null), "Otro");
  });

  it("el HTML no tiene NaN, ni scripts ni recursos externos", () => {
    const s = computeStats(
      [r("2025-03-10T10:00:00Z", 100), r("2026-03-10T10:00:00Z", 120)],
      products,
      new Date("2026-04-01T00:00:00Z"),
    );
    const html = renderReport(s, new Date("2026-04-01T00:00:00Z"));
    assert.ok(!/NaN|undefined|Infinity/.test(html));
    assert.ok(!/<script|https?:\/\//i.test(html));
    assert.match(html, /<svg/);
  });
});
