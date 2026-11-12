import {
  dueAlerts,
  groupByCustomer,
  mayRunOut,
  stockAlertTtlDays,
  variantLabel,
  waitingCsv,
  waitingSummary,
} from "../stock-alerts";

const a = (id: string, customer: string, variant: string, product = "prod_1") => ({
  id,
  customer_id: customer,
  product_id: product,
  variant_id: variant,
});

describe("avisos de stock (Fase MK-B)", () => {
  it("caducidad: 30–730 días, si no 180", () => {
    expect(stockAlertTtlDays(undefined)).toBe(180);
    expect(stockAlertTtlDays("365")).toBe(365);
    expect(stockAlertTtlDays("10")).toBe(180);
    expect(stockAlertTtlDays("1000")).toBe(180);
    expect(stockAlertTtlDays("90.5")).toBe(180);
  });

  it("se cumplen los de variantes con stock; cuántos esperaban por variante", () => {
    const alerts = [
      a("1", "cus_a", "v1"),
      a("2", "cus_b", "v1"),
      a("3", "cus_a", "v2"),
      a("4", "cus_c", "v3"),
    ];
    const { due, restocks } = dueAlerts(
      alerts,
      new Map([
        ["v1", 3],
        ["v2", 0],
        ["v3", Infinity],
      ]),
    );
    expect(due.map((d) => d.id)).toEqual(["1", "2", "4"]);
    expect(restocks.get("v1")).toEqual({ variant_id: "v1", available: 3, waiting: 2 });
    expect(restocks.get("v3")?.waiting).toBe(1);
    expect(restocks.has("v2")).toBe(false);
    expect([...groupByCustomer(due).entries()].map(([c, l]) => [c, l.length])).toEqual([
      ["cus_a", 1],
      ["cus_b", 1],
      ["cus_c", 1],
    ]);
  });

  it("«puede agotarse pronto»: lo repuesto no llega para todos los que esperaban", () => {
    expect(mayRunOut({ variant_id: "v", available: 3, waiting: 1 })).toBe(false);
    expect(mayRunOut({ variant_id: "v", available: 3, waiting: 3 })).toBe(true);
    expect(mayRunOut({ variant_id: "v", available: 3, waiting: 20 })).toBe(true);
    expect(mayRunOut({ variant_id: "v", available: Infinity, waiting: 20 })).toBe(false);
  });

  it("resumen de espera: por variante, de más a menos, con el más antiguo y CSV", () => {
    const rows = waitingSummary(
      [
        { ...a("1", "c1", "v1"), created_at: "2026-11-03T10:00:00Z" },
        { ...a("2", "c2", "v2", "prod_2"), created_at: "2026-11-01T10:00:00Z" },
        { ...a("3", "c3", "v2", "prod_2"), created_at: "2026-10-20T10:00:00Z" },
      ],
      new Map([
        ["v1", { product_title: "Arnés", variant_title: "M", sku: "ARN-M" }],
        ["v2", { product_title: "Premios; pollo", variant_title: null, sku: null }],
      ]),
    );
    expect(rows.map((r) => [r.variant_id, r.waiting, r.oldest.slice(0, 10)])).toEqual([
      ["v2", 2, "2026-10-20"],
      ["v1", 1, "2026-11-03"],
    ]);
    expect(waitingCsv(rows).split("\n")).toEqual([
      "esperando;producto;variante;sku;desde;product_id;variant_id",
      '2;"Premios; pollo";;;2026-10-20;prod_2;v2',
      "1;Arnés;M;ARN-M;2026-11-03;prod_1;v1",
    ]);
  });

  it("título de la variante solo si dice algo", () => {
    expect(variantLabel("Arnés", "Rayas / M")).toBe("Rayas / M");
    expect(variantLabel("Arnés", "Única")).toBeNull();
    expect(variantLabel("Arnés", "Arnés")).toBeNull();
    expect(variantLabel("Arnés", null)).toBeNull();
  });
});
