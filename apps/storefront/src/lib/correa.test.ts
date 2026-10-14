import { describe, expect, it } from "vitest";
import type { StoreProduct } from "./catalog";
import {
  CORREA_GROUP_ID,
  cardProduct,
  cardTablePrices,
  cleanNotes,
  correaCards,
  correaLiveData,
  correaModel,
  exactRange,
  findCorreaVariant,
  groupCorreas,
  groupSearchIds,
  lineDetails,
  correaMasks,
  maxLength,
  swatchCss,
  tableProducts,
  tableVariantIds,
} from "./correa";
import { correaLive } from "./live-sync";

const CLIPS = [
  { code: "EST", name: "Estándar", s: 0 },
  { code: "MON", name: "Montaña", s: 3 },
  { code: "SEG", name: "Seguridad", s: 5 },
];
const LENGTHS = [
  { m: 3, sup: 0 },
  { m: 4, sup: 1.5 },
  { m: 5, sup: 3 },
];

/** Correa como la genera correas:sync: 3 largos × 3 × 3. `stock(m, perro, mano)` = unidades. */
function correa(
  id: string,
  { base = 24, stock = () => 5, color = "Azul", material = "Nailon" } = {} as {
    base?: number;
    stock?: (m: number, d: string, h: string) => number;
    color?: string;
    material?: string;
  },
): StoreProduct {
  return {
    id,
    handle: `correa-${id}`,
    title: `Correa ${id}`,
    metadata: { plantilla: "correa", grupo: "correa", color, material },
    categories: [{ id: "pcat_correas", handle: "correas-perro", name: "Correas" }],
    variants: LENGTHS.flatMap((l) =>
      CLIPS.flatMap((d) =>
        CLIPS.map((h) => ({
          id: `v_${id}_${l.m}_${d.code}_${h.code}`,
          title: `${l.m} m / ${d.name} / ${h.name}`,
          manage_inventory: true,
          allow_backorder: false,
          inventory_quantity: stock(l.m, d.code, h.code),
          metadata: { largo_m: l.m, mosqueton_perro: d.code, mosqueton_mano: h.code },
          options: [{ value: d.name, option: { title: "Mosquetón lado perro" } }],
          calculated_price: {
            calculated_amount_with_tax: base + l.sup + d.s + h.s,
            currency_code: "eur",
          },
        })),
      ),
    ),
  } as unknown as StoreProduct;
}

const plain = (id: string) =>
  ({ id, handle: id, title: id, metadata: {}, variants: [] }) as unknown as StoreProduct;

describe("modelo de precio", () => {
  it("base por largo + recargo por mosquetón", () => {
    const m = correaModel(correa("a"));
    expect(m.lengths).toEqual([
      { m: 3, base: 24 },
      { m: 4, base: 25.5 },
      { m: 5, base: 27 },
    ]);
    expect(m.clips).toEqual([
      { code: "EST", name: "Estándar", surcharge: 0 },
      { code: "MON", name: "Montaña", surcharge: 3 },
      { code: "SEG", name: "Seguridad", surcharge: 5 },
    ]);
    expect(correaLiveData(correa("a"))).toMatchObject({
      c: ["EST", "MON", "SEG"],
      l: [3, 4, 5],
      b: [2400, 2550, 2700],
      s: [0, 300, 500],
    });
  });

  it("falla el build si un precio no cumple la fórmula (p. ej. una oferta en una variante)", () => {
    const p = correa("a");
    p.variants![10]!.calculated_price!.calculated_amount_with_tax = 1;
    expect(() => correaModel(p)).toThrow(/no es base \+ recargos/);
    const q = correa("b");
    q.variants = q.variants!.slice(1);
    expect(() => correaModel(q)).toThrow(/falta la variante 3 m \/ EST \/ EST/);
  });
});

describe("disponibilidad", () => {
  it("máscaras de 9 bits por largo (perro × 3 + mano) y «hasta X m»", () => {
    // Sin Seguridad (bit de SEG en cualquier lado = 0) y sin cuerda para 5 m
    const p = correa("a", { stock: (m, d, h) => (m === 5 || d === "SEG" || h === "SEG" ? 0 : 1) });
    const masks = correaMasks(p, ["EST", "MON", "SEG"]);
    expect(masks.m).toEqual({ 3: 0b000011011, 4: 0b000011011, 5: 0 });
    expect(correaMasks(correa("b", { stock: () => 0 })).m).toEqual({ 3: 0, 4: 0, 5: 0 });
    expect(maxLength(p)).toBe(4);
    expect(maxLength(correa("b", { stock: () => 0 }))).toBe(0);
  });
});

describe("variante y datos de la línea", () => {
  it("busca la variante por largo y mosquetones", () => {
    const p = correa("a");
    expect(findCorreaVariant(p.variants!, 4, "MON", "SEG")).toBe("v_a_4_MON_SEG");
    expect(findCorreaVariant(p.variants!, 9, "MON", "SEG")).toBeNull();
  });

  it("medida exacta dentro del metro elegido", () => {
    expect(exactRange(7)).toEqual({ minCm: 601, maxCm: 700 });
  });

  it("observaciones: recorta, normaliza saltos y rechaza control y > 200", () => {
    expect(cleanNotes("  Para Hiro\r\nque tira  ")).toBe("Para Hiro\nque tira");
    expect(cleanNotes("   ")).toBeNull();
    expect(cleanNotes("a\u0007b")).toBe(false);
    expect(cleanNotes("x".repeat(201))).toBe(false);
    expect(cleanNotes("ñ".repeat(200))).toBe("ñ".repeat(200));
  });

  it("detalles de la línea en carrito, pedido y email", () => {
    expect(lineDetails({ medida_cm: 640, observaciones: " Para Hiro " })).toEqual([
      "Medida exacta: 6,40 m",
      "Observaciones: Para Hiro",
    ]);
    expect(lineDetails({ medida_cm: "640" })).toEqual([]);
    expect(lineDetails(null)).toEqual([]);
  });
});

describe("agrupación en listados y búsqueda", () => {
  it("una tarjeta de grupo en el sitio de la primera correa, con todas sus variantes", () => {
    const list = [plain("p1"), correa("a"), plain("p2"), correa("b", { color: "Rojo" })];
    const out = groupCorreas(list);
    expect(out.map((p) => p.id)).toEqual(["p1", CORREA_GROUP_ID, "p2"]);
    const group = out[1]!;
    expect(group.handle).toBe("correa-a-medida");
    expect(group.subtitle).toBe("Azul y Rojo · nailon");
    expect(group.categories?.map((c) => c.handle)).toEqual(["correas-perro"]);
    expect(group.variants).toHaveLength(54);
    expect(groupCorreas([plain("p1")]).map((p) => p.id)).toEqual(["p1"]);
  });

  it("búsqueda: agrupa con ≥ 2 correas; con una, su ficha", () => {
    const cards = correaCards([correa("a"), correa("b")])!;
    expect(groupSearchIds(["x", "a", "y", "b"], cards)).toEqual(["x", CORREA_GROUP_ID, "y"]);
    expect(groupSearchIds(["x", "b"], cards)).toEqual(["x", "b"]);
    expect(groupSearchIds(["x"], null)).toEqual(["x"]);
  });

  it("tarjetas en vivo: solo las variantes del largo más corto (precio «Desde» y stock)", () => {
    const a = correa("a");
    const cards = correaCards([a, plain("p1")])!;
    expect(Object.keys(cards.members)).toEqual(["a"]);
    expect(cards.members.a!.v).toHaveLength(9);
    expect(cards.group.v).toHaveLength(9);
    const fresh = cardProduct("a", cards.members.a!, a.variants!);
    expect(fresh.variants).toHaveLength(9);
    // Tabla de la landing: largos con estándar y recargo de cada mosquetón (3 + 3 - 1 compartida)
    expect(tableVariantIds(cards.members.a!)).toHaveLength(5);
    expect(cardTablePrices(cards.members.a!, a.variants!)).toEqual({
      lengths: [
        [3, 24],
        [4, 25.5],
        [5, 27],
      ],
      clips: [
        ["EST", 0],
        ["MON", 3],
        ["SEG", 5],
      ],
    });
  });
});

describe("landing", () => {
  it("tabla: la primera correa de cada material", () => {
    const list = [
      correa("a"),
      correa("b", { color: "Rojo" }),
      correa("c", { material: "PVC", base: 25 }),
    ];
    expect(tableProducts(list).map((p) => p.id)).toEqual(["a", "c"]);
  });

  it("CSS de las muestras: color por handle y CTA de la elegida (:has)", () => {
    const sw = [
      { handle: "correa-azul", color: "Azul", material: "Nailon", hex: "#1E5AA8" },
      { handle: "correa-gris", color: "Gris", material: "Nailon", hex: null },
    ];
    expect(swatchCss(sw)).toBe(".sw-correa-azul{--sw:#1E5AA8}");
    expect(swatchCss(sw, true)).toContain(
      '.correa-pick:has([value="correa-gris"]:checked) [data-cta="correa-gris"]{display:inline-flex}',
    );
  });
});

describe("LiveSync de la ficha", () => {
  it("producto + datos del configurador; sin entradas por variante", () => {
    const { entries, correa: data } = correaLive(correa("a"));
    expect(entries.map((e) => e.id)).toEqual(["a"]);
    expect(data?.m[3]).toBe(511);
    expect(data?.b).toEqual([2400, 2550, 2700]);
  });

  it("si los precios actuales no cumplen la fórmula, sin datos del configurador", () => {
    const p = correa("a");
    p.variants![3]!.calculated_price!.calculated_amount_with_tax = 1;
    const { entries, correa: data } = correaLive(p);
    expect(entries.map((e) => e.id)).toEqual(["a"]);
    expect(data).toBeNull();
  });
});
