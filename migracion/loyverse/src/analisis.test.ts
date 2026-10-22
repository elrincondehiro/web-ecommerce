import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  buildReview,
  categorySummary,
  dailySales,
  groupKey,
  indexSales,
  mergeEdits,
  similarGroups,
  suggest,
  variantPrice,
  type Catalog,
  type SaleReceipt,
} from "./analisis.ts";
import { parseCsv, toCsv } from "./csv.ts";
import { monthsBetween } from "./months.ts";
import { mergeInto, normalizeDecision, select } from "./seleccion.ts";
import { trimReceipt } from "./descargar.ts";
import type { Item, Receipt } from "./types.ts";

const NOW = new Date("2026-10-21T12:00:00Z");
const ago = (months: number) => new Date(NOW.getTime() - months * 30.44 * 86_400_000).toISOString();

const item = (id: string, name: string, extra: Partial<Item> = {}): Item => ({
  id,
  item_name: name,
  category_id: "c1",
  track_stock: true,
  created_at: ago(60),
  updated_at: ago(30),
  variants: [
    {
      variant_id: `${id}-v`,
      item_id: id,
      sku: id,
      default_pricing_type: "FIXED",
      default_price: 10,
      cost: 4,
      stores: [{ store_id: "s1", pricing_type: "FIXED", price: 12 }],
    },
  ],
  ...extra,
});

const receipt = (date: string, variant: string, qty: number, extra: Partial<SaleReceipt> = {}) =>
  ({
    receipt_number: `${date}-${variant}`,
    receipt_type: "SALE",
    created_at: date,
    receipt_date: date,
    cancelled_at: null,
    total_money: qty * 12,
    total_tax: 0,
    total_discount: 0,
    line_items: [
      {
        item_id: null,
        variant_id: variant,
        item_name: "x",
        variant_name: null,
        quantity: qty,
        total_money: qty * 12,
        cost_total: qty * 4,
      },
    ],
    ...extra,
  }) satisfies SaleReceipt;

describe("meses", () => {
  it("de un mes al actual, con el último milisegundo como fin", () => {
    const m = monthsBetween("2025-11", NOW);
    assert.equal(m.length, 12);
    assert.equal(m[0]!.key, "2025-11");
    assert.equal(m[0]!.to, "2025-11-30T23:59:59.999Z");
    assert.equal(m.at(-1)!.key, "2026-10");
    assert.throws(() => monthsBetween("2025-13", NOW));
  });
});

describe("tickets: lo que se guarda", () => {
  it("sin cliente, empleado, nota ni datos de la tarjeta", () => {
    const r = {
      receipt_number: "1-1",
      receipt_type: "SALE",
      created_at: "2026-01-01T10:00:00Z",
      customer_id: "cli",
      employee_id: "emp",
      note: "Llamar a Juan",
      line_items: [{ item_id: "i", variant_id: "v", quantity: 1, total_money: 5 }],
      payments: [
        {
          name: "Tarjeta",
          type: "NONINTEGRATEDCARD",
          money_amount: 5,
          payment_details: { card_number: "**** 1234" },
        },
      ],
    } as unknown as Receipt;
    const t = trimReceipt(r);
    const json = JSON.stringify(t);
    for (const secret of ["cli", "emp", "Juan", "1234"]) assert.ok(!json.includes(secret), secret);
    assert.equal(t.line_items[0]!.variant_id, "v");
    assert.equal(t.payments[0]!.name, "Tarjeta");
  });
});

describe("ventas por variante", () => {
  it("suma ventas, resta devoluciones, ignora cancelados y cuenta huérfanas", () => {
    const s = indexSales(
      [
        receipt(ago(1), "a-v", 2),
        receipt(ago(18), "a-v", 3),
        receipt(ago(1), "a-v", 1, { receipt_type: "REFUND" }),
        receipt(ago(2), "a-v", 5, { cancelled_at: ago(2) }),
        receipt(ago(1), "zzz", 1),
      ],
      new Set(["a-v"]),
      NOW,
    );
    const a = s.byVariant.get("a-v")!;
    assert.equal(a.units12, 1);
    assert.equal(a.units24, 4);
    assert.equal(a.unitsTotal, 4);
    assert.equal(s.orphanLines, 1);
    assert.equal(s.receipts, 4);
  });
});

describe("sugerencia", () => {
  const sales = (monthsAgo: number | null) =>
    monthsAgo === null
      ? undefined
      : {
          lastSale: ago(monthsAgo),
          units12: 0,
          units24: 0,
          unitsTotal: 1,
          amount12: 0,
          amountTotal: 0,
        };
  const run = (opts: {
    deleted?: boolean;
    created?: number;
    stock?: number | null;
    sold?: number | null;
  }) =>
    suggest(
      {
        deleted: opts.deleted ?? false,
        createdAt: ago(opts.created ?? 60),
        stock: opts.stock ?? 0,
        sales: sales(opts.sold ?? null),
      },
      NOW,
    ).suggestion;
  it("reglas", () => {
    assert.equal(run({ deleted: true, sold: 1 }), "no");
    assert.equal(run({ sold: 3 }), "sí");
    assert.equal(run({ created: 2 }), "revisar");
    assert.equal(run({ sold: null, stock: 0 }), "no");
    assert.equal(run({ sold: null, stock: 3 }), "revisar");
    assert.equal(run({ sold: 30, stock: 0 }), "no");
    assert.equal(run({ sold: 30, stock: 2 }), "revisar");
    assert.equal(run({ sold: 18 }), "revisar");
  });
});

describe("grupos de nombres parecidos", () => {
  it("quita tallas, colores y medidas", () => {
    assert.equal(groupKey("Collar Nylon Rojo M"), "collar nylon");
    assert.equal(groupKey("Pienso Acana Puppy 2kg"), "pienso acana");
    assert.equal(groupKey("Pienso Acana 11,4 kg"), "pienso acana");
    const g = similarGroups([
      { id: "1", item_name: "Collar Nylon Rojo M" },
      { id: "2", item_name: "Collar nylon azul L" },
      { id: "3", item_name: "Juguete pelota" },
    ]);
    assert.equal(g.get("1"), "collar nylon");
    assert.equal(g.get("2"), "collar nylon");
    assert.equal(g.has("3"), false);
  });
});

describe("hoja de revisión", () => {
  const catalog: Catalog = {
    items: [
      item("a", "Collar Nylon Rojo M"),
      item("b", "Collar Nylon Azul L", { category_id: null }),
      item("c", "Viejo", { deleted_at: ago(10) }),
    ],
    categories: [{ id: "c1", name: "Collares" }],
    suppliers: [],
    taxes: [],
    inventory: [
      { variant_id: "a-v", store_id: "s1", in_stock: 3 },
      { variant_id: "b-v", store_id: "otra", in_stock: 99 },
    ],
    storeId: "s1",
  };
  const sales = indexSales([receipt(ago(1), "a-v", 2)], new Set(["a-v", "b-v", "c-v"]), NOW);
  const rows = buildReview(catalog, sales, NOW);

  it("precio y stock de la tienda; problemas; grupos; borrados al final", () => {
    assert.equal(variantPrice(catalog.items[0]!.variants[0]!, "s1"), 12);
    assert.equal(variantPrice(catalog.items[0]!.variants[0]!, "otra"), 10);
    const a = rows.find((r) => r.variant_id === "a-v")!;
    assert.equal(a.precio, 12);
    assert.equal(a.stock, 3);
    assert.equal(a.margen_pct, 66.67);
    assert.equal(a.sugerencia, "sí");
    assert.equal(a.grupo_sugerido, "collar nylon");
    const b = rows.find((r) => r.variant_id === "b-v")!;
    assert.equal(b.stock, null); // stock de otra tienda: no cuenta
    assert.match(String(b.problemas), /sin categoría/);
    assert.equal(rows.at(-1)!.variant_id, "c-v");
    assert.equal(rows.at(-1)!.sugerencia, "no");
  });

  it("al regenerar conserva la revisión", () => {
    const again = buildReview(catalog, sales, NOW);
    const kept = mergeEdits(again, [
      { variant_id: "b-v", decision: "sí", categoria_nueva: "Collares perro", notas: "unir con a" },
    ]);
    assert.equal(kept, 1);
    const b = again.find((r) => r.variant_id === "b-v")!;
    assert.equal(b.decision, "sí");
    assert.equal(b.categoria_nueva, "Collares perro");
  });

  it("resumen por categoría (sin borrados)", () => {
    const s = categorySummary(rows);
    assert.deepEqual(
      s.map((c) => [c.categoria, c.variantes]),
      [
        ["Collares", 1],
        ["(sin categoría)", 1],
      ],
    );
  });
});

describe("ventas diarias", () => {
  it("por día en hora de Madrid (las 23:30 UTC ya son el día siguiente)", () => {
    const d = dailySales([
      receipt("2026-07-01T23:30:00Z", "a-v", 1),
      receipt("2026-07-02T09:00:00Z", "a-v", 2),
      receipt("2026-07-02T10:00:00Z", "a-v", 1, { receipt_type: "REFUND" }),
    ]);
    assert.deepEqual(
      d.map((x) => [x.fecha, x.tickets, x.devoluciones, x.importe]),
      [["2026-07-02", 2, 1, 24]],
    );
  });
});

describe("CSV y selección", () => {
  it("ida y vuelta, también con «;» de LibreOffice", () => {
    const csv = toCsv(["a", "b"], [{ a: 'Collar "rojo", M', b: 1.5 }]);
    assert.deepEqual(parseCsv(csv).rows, [{ a: 'Collar "rojo", M', b: "1.5" }]);
    assert.deepEqual(parseCsv("\ufeffa;b\r\nx;y\r\n").rows, [{ a: "x", b: "y" }]);
  });

  it("decisión y selección con correcciones", () => {
    assert.equal(normalizeDecision("Sí"), "sí");
    assert.equal(normalizeDecision("x"), "sí");
    assert.equal(normalizeDecision(" N "), "no");
    assert.equal(normalizeDecision(""), "");
    assert.equal(normalizeDecision("quizá"), null);
    const r = select([
      { decision: "sí", articulo: "A", categoria: "C", nombre_nuevo: "A nuevo", variant_id: "1" },
      { decision: "no", articulo: "B", variant_id: "2" },
      { decision: "", articulo: "C", variant_id: "3" },
      { decision: "tal vez", articulo: "D", variant_id: "4" },
    ]);
    assert.equal(r.selected.length, 1);
    assert.equal(r.selected[0]!.articulo, "A nuevo");
    assert.equal(r.selected[0]!.articulo_loyverse, "A");
    assert.equal(r.rejected, 1);
    assert.equal(r.pending, 1);
    assert.deepEqual(r.invalid, [{ line: 5, value: "tal vez" }]);
  });

  it("volcar decisiones de una hoja por categoría a la general (vacío no borra)", () => {
    const target = [
      { variant_id: "1", decision: "", notas: "ya estaba" },
      { variant_id: "2", decision: "no", notas: "" },
    ];
    const r = mergeInto(target, [
      { variant_id: "1", decision: "si", notas: "" },
      { variant_id: "2", decision: "", notas: "" },
      { variant_id: "9", decision: "si" },
    ]);
    assert.equal(r.changed, 1);
    assert.deepEqual(r.unknown, ["9"]);
    assert.deepEqual(target[0], { variant_id: "1", decision: "si", notas: "ya estaba" });
    assert.equal(target[1]!.decision, "no");
  });
});
