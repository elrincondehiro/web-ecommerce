import { isLiveSaleList, isVariantOnSale, pickSaleProducts } from "../ofertas";

const now = new Date("2026-11-27T10:00:00.000Z");
const sale = (calc: number, orig: number, type: string | null = "sale") => ({
  calculated_price: {
    calculated_amount: calc,
    original_amount: orig,
    calculated_price: { price_list_type: type },
  },
});

describe("isLiveSaleList", () => {
  it("acepta una lista sale activa sin fechas", () => {
    expect(isLiveSaleList({ type: "sale", status: "active" }, now)).toBe(true);
  });
  it("descarta borrador, override y listas fuera de fechas", () => {
    expect(isLiveSaleList({ type: "sale", status: "draft" }, now)).toBe(false);
    expect(isLiveSaleList({ type: "override", status: "active" }, now)).toBe(false);
    expect(
      isLiveSaleList({ type: "sale", status: "active", starts_at: "2026-11-28T00:00:00Z" }, now),
    ).toBe(false);
    expect(
      isLiveSaleList({ type: "sale", status: "active", ends_at: "2026-11-27T10:00:00Z" }, now),
    ).toBe(false);
    expect(
      isLiveSaleList(
        { type: "sale", status: "active", starts_at: "2026-11-01", ends_at: "2026-12-01" },
        now,
      ),
    ).toBe(true);
  });
});

describe("isVariantOnSale", () => {
  it("solo si el precio calculado viene de una lista sale y es menor", () => {
    expect(isVariantOnSale(sale(8, 10))).toBe(true);
    expect(isVariantOnSale(sale(10, 10))).toBe(false);
    expect(isVariantOnSale(sale(8, 10, "override"))).toBe(false);
    expect(isVariantOnSale(sale(8, 10, null))).toBe(false);
    expect(isVariantOnSale(null)).toBe(false);
  });
});

describe("pickSaleProducts", () => {
  it("filtra por publicado, canal y oferta, y ordena por título", () => {
    const rows = [
      {
        id: "b",
        title: "Bolso",
        status: "published",
        sales_channels: [{ id: "sc" }],
        variants: [sale(8, 10)],
      },
      {
        id: "a",
        title: "Abrigo",
        status: "published",
        sales_channels: [{ id: "sc" }],
        variants: [sale(10, 10), sale(5, 9)],
      },
      {
        id: "d",
        title: "Draft",
        status: "draft",
        sales_channels: [{ id: "sc" }],
        variants: [sale(8, 10)],
      },
      {
        id: "o",
        title: "Otro canal",
        status: "published",
        sales_channels: [{ id: "x" }],
        variants: [sale(8, 10)],
      },
      {
        id: "n",
        title: "Normal",
        status: "published",
        sales_channels: [{ id: "sc" }],
        variants: [sale(10, 10, null)],
      },
    ];
    expect(pickSaleProducts(rows, ["sc"])).toEqual(["a", "b"]);
  });
});
