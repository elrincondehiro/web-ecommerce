import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { StoreProduct } from "./catalog";
import {
  buildVariantPicker,
  findVariantByOptions,
  MAX_VALUES,
  pickerColorCss,
  pickerCss,
} from "./variant-picker";

const CSS_FILE = new URL("../styles/variant-picker.css", import.meta.url);
const HEADER =
  "/* GENERADO por lib/variant-picker.ts (pickerCss). No editar: PICKER_CSS=write pnpm --filter storefront test. */\n";

type Opt = { title: string; values: (string | { value: string; color?: string })[] };
/** Producto con las combinaciones de `opts`; `out` = títulos de variante agotados. */
function product(
  opts: Opt[],
  o: {
    out?: string[];
    price?: (title: string) => number;
    images?: (values: string[]) => string[];
    metadata?: Record<string, unknown>;
    productImages?: string[];
  } = {},
): StoreProduct {
  const options = opts.map((opt, k) => ({
    id: `opt_${k}`,
    title: opt.title,
    values: opt.values.map((v) =>
      typeof v === "string"
        ? { value: v, metadata: null }
        : { value: v.value, metadata: v.color ? { color: v.color } : null },
    ),
  }));
  const combos: string[][] = options.reduce<string[][]>(
    (acc, opt) => acc.flatMap((c) => opt.values.map((v) => [...c, v.value])),
    [[]],
  );
  return {
    id: "prod_1",
    handle: "p",
    metadata: o.metadata ?? {},
    images: (o.productImages ?? []).map((url) => ({ url })),
    options,
    variants: combos.map((values, i) => {
      const title = values.join(" / ");
      return {
        id: `variant_${i}`,
        title,
        manage_inventory: true,
        inventory_quantity: o.out?.includes(title) ? 0 : 3,
        options: values.map((value, k) => ({
          value,
          option_id: `opt_${k}`,
          option: { title: options[k]!.title },
        })),
        images: (o.images?.(values) ?? []).map((url) => ({ url })),
        calculated_price: {
          calculated_amount_with_tax: o.price?.(title) ?? 10,
          currency_code: "eur",
        },
      };
    }),
  } as unknown as StoreProduct;
}

const ESTAMPADO: Opt = { title: "Estampado", values: ["Rayas", "Flores", "Huellas"] };
const TALLA: Opt = { title: "Talla", values: ["L", "XS", "M"] };

describe("buildVariantPicker", () => {
  it("dos opciones: A = la que no es de tallas; valores ordenados; preselección con stock", () => {
    const p = buildVariantPicker(
      product([TALLA, ESTAMPADO], { out: ["XS / Flores", "M / Flores", "L / Flores"] }),
    )!;
    expect(p.a.title).toBe("Estampado");
    expect(p.a.values.map((v) => v.value)).toEqual(["Flores", "Huellas", "Rayas"]);
    expect(p.b?.values.map((v) => v.value)).toEqual(["XS", "M", "L"]);
    expect(p.a.values[0]!.field).toBe("Estampado:Flores");
    // Flores está agotado entero: primera con stock = Huellas / XS
    expect(p.selected).toEqual({ a: 1, b: 0 });
    expect(p.cells[1]![0]!.title).toBe("XS / Huellas");
    expect(p.priceRange).toBe(false);
  });

  it("opcion_fotos manda; fotos por valor sin las generales", () => {
    const p = buildVariantPicker(
      product([ESTAMPADO, TALLA], {
        metadata: { opcion_fotos: "Estampado" },
        images: ([e]) => ["gen.jpg", `${e}-1.jpg`, `${e}-2.jpg`],
      }),
    )!;
    expect(p.a.title).toBe("Estampado");
    expect(p.a.values.map((v) => v.images)).toEqual([
      ["Flores-1.jpg", "Flores-2.jpg"],
      ["Huellas-1.jpg", "Huellas-2.jpg"],
      ["Rayas-1.jpg", "Rayas-2.jpg"],
    ]);
    expect(p.generalImages).toEqual(["gen.jpg"]);
  });

  it("sin opcion_fotos: la de colores va primero y las fotos son las del producto", () => {
    const color: Opt = { title: "Color", values: [{ value: "Rojo", color: "#c0392b" }, "Azul"] };
    const p = buildVariantPicker(product([TALLA, color], { productImages: ["a.jpg"] }))!;
    expect(p.a.title).toBe("Color");
    expect(p.a.values.map((v) => v.color)).toEqual([null, "#c0392b"]);
    expect(p.generalImages).toEqual(["a.jpg"]);
    expect(pickerColorCss(p)).toBe('.vp [data-sw="a2"]{--sw:#c0392b}');
  });

  it("color no válido en la metadata: se ignora (va a un <style>)", () => {
    const color: Opt = {
      title: "Color",
      values: [{ value: "Rojo", color: "red}body{x:1" }, "Azul"],
    };
    const p = buildVariantPicker(product([TALLA, color]));
    expect(p).not.toBeNull();
    expect(pickerColorCss(p!)).toBe("");
  });

  it("tabla de siempre: una opción sin foto ni color, 3 opciones, demasiados valores, una variante", () => {
    expect(buildVariantPicker(product([TALLA]))).toBeNull();
    expect(
      buildVariantPicker(product([TALLA, ESTAMPADO, { title: "Peso", values: ["1"] }])),
    ).toBeNull();
    const many: Opt = {
      title: "Estampado",
      values: Array.from({ length: MAX_VALUES + 1 }, (_, i) => `E${i}`),
    };
    expect(buildVariantPicker(product([many, TALLA]))).toBeNull();
    expect(buildVariantPicker(product([{ title: "Talla", values: ["M"] }]))).toBeNull();
  });

  it("una opción con color: selector; combinación que no existe = null", () => {
    const p = buildVariantPicker(
      product([{ title: "Color", values: [{ value: "Rojo", color: "#f00" }, "Azul"] }]),
    )!;
    expect(p.b).toBeNull();
    expect(p.cells.map((r) => r.length)).toEqual([1, 1]);
  });

  it("precios distintos → cada talla enseña el suyo", () => {
    const p = buildVariantPicker(
      product([ESTAMPADO, TALLA], { price: (t) => (t.endsWith("L") ? 12 : 10) }),
    )!;
    expect(p.priceRange).toBe(true);
  });
});

describe("findVariantByOptions", () => {
  const p = product([ESTAMPADO, TALLA]);
  it("encuentra la combinación exacta", () => {
    const id = findVariantByOptions(p, ["Estampado:Flores", "Talla:M"]);
    expect(p.variants!.find((v) => v.id === id)?.title).toBe("Flores / M");
  });
  it("valor con «:» dentro", () => {
    const q = product([{ title: "Formato", values: ["Pack 2:1", "Suelto"] }, TALLA]);
    expect(findVariantByOptions(q, ["Formato:Pack 2:1", "Talla:M"])).toBe("variant_2");
  });
  it("falta una opción, sobra, se repite, o no existe → null", () => {
    expect(findVariantByOptions(p, ["Estampado:Flores"])).toBeNull();
    expect(findVariantByOptions(p, ["Estampado:Flores", "Talla:M", "Peso:1"])).toBeNull();
    expect(findVariantByOptions(p, ["Estampado:Flores", "Estampado:Rayas"])).toBeNull();
    expect(findVariantByOptions(p, ["Estampado:Lunares", "Talla:M"])).toBeNull();
    expect(findVariantByOptions(p, ["sin-dos-puntos", "Talla:M"])).toBeNull();
    expect(findVariantByOptions(p, [])).toBeNull();
  });
});

describe("pickerCss", () => {
  it("styles/variant-picker.css está al día (si falla: PICKER_CSS=write pnpm --filter storefront test)", () => {
    if (process.env.PICKER_CSS === "write") writeFileSync(CSS_FILE, HEADER + pickerCss());
    expect(readFileSync(CSS_FILE, "utf8")).toBe(HEADER + pickerCss());
  });
  it("cabe en el presupuesto: ≤ 1 KB gzip", () => {
    expect(gzipSync(pickerCss(), { level: 9 }).length).toBeLessThanOrEqual(1024);
  });
});
