import { readFileSync } from "node:fs";
import path from "node:path";
import { decodeUtf8, parseCsv } from "../lib/csv";
import { parsePrice, readCategories, readProducts, stepPrice } from "../lib/catalog-sheet";
import { bulkMinimumAmount, bulkMinimumError, bulkRule } from "../../lib/granel";
import {
  planCatalog,
  productCreateInput,
  planSale,
  variantUpdateInput,
  type CatalogSnapshot,
  type DbProduct,
} from "../lib/catalog-plan";

const TEMPLATE = path.join(__dirname, "../../../catalog/plantilla");
const csv = (rows: string[]) => parseCsv(rows.join("\n"));

const emptyDb = (over: Partial<CatalogSnapshot> = {}): CatalogSnapshot => ({
  categories: [],
  collections: [],
  tags: [],
  options: [],
  types: ["iva-reducido", "iva-superreducido"],
  products: [],
  skuOwners: {},
  eanOwners: {},
  ...over,
});

describe("csv", () => {
  it("comillas, saltos de línea, BOM, CRLF y comentarios", () => {
    const t = parseCsv('\uFEFF"# nota, con coma"\r\na,b\r\n"x ""y""","línea 1\nlínea 2"\r\n');
    expect(t.delimiter).toBe(",");
    expect(t.rows).toEqual([
      { line: 2, cells: ["a", "b"] },
      { line: 3, cells: ['x "y"', "línea 1\nlínea 2"] },
    ]);
  });

  it("detecta `;` (Excel en español) aunque los comentarios lleven comas", () => {
    const t = parseCsv('"# a, b, c"\nhandle;precio\nx;19,95');
    expect(t.delimiter).toBe(";");
    expect(t.rows[1]?.cells).toEqual(["x", "19,95"]);
  });

  it("rechaza un fichero que no es UTF-8", () => {
    expect(() => decodeUtf8(Uint8Array.from([0x61, 0xe9, 0x62]))).toThrow(/UTF-8/);
  });

  it("comillas sin cerrar = error", () => {
    expect(() => parseCsv('a\n"sin cerrar')).toThrow(/Comillas/);
  });
});

describe("hojas", () => {
  it("parsePrice", () => {
    expect(parsePrice("19,95")).toBe(19.95);
    expect(parsePrice("19.9")).toBe(19.9);
    expect(parsePrice("19,95 €")).toBe(19.95);
    expect(parsePrice("1.234,50")).toBeNull();
    expect(parsePrice("abc")).toBeNull();
  });

  it("la plantilla es válida (categorías y productos)", () => {
    const cats = readCategories(
      parseCsv(readFileSync(path.join(TEMPLATE, "categorias.csv"), "utf8")),
    );
    expect(cats.errors).toEqual([]);
    expect(cats.warnings).toEqual([]);
    expect(cats.categories.find((c) => c.handle === "pienso-perro")?.parent).toBe(
      "alimentacion-perro",
    );

    const prods = readProducts(
      parseCsv(readFileSync(path.join(TEMPLATE, "productos.csv"), "utf8")),
    );
    expect(prods.errors).toEqual([]);
    expect(prods.warnings).toEqual([]);
    const col = prods.products.find((p) => p.handle === "collar-nylon");
    expect(col?.options).toEqual(["Talla", "Color"]);
    // Herencia: S Azul hereda 12,95 de S Rojo; L Azul, 15,95 y la oferta de L Rojo
    expect(col?.variants.map((v) => [v.sku, v.price, v.salePrice])).toEqual([
      ["COL-NYL-S-ROJ", 12.95, null],
      ["COL-NYL-S-AZU", 12.95, null],
      ["COL-NYL-L-ROJ", 15.95, 13.95],
      ["COL-NYL-L-AZU", 15.95, 13.95],
    ]);
    expect(col?.variants[1]?.weight).toBe(60);
    expect(col?.variants[2]?.weight).toBe(90);
    expect(col?.description).toContain("\n");
    expect(col?.tags).toEqual(["novedad", "reflectante"]);

    const pienso = prods.products.find((p) => p.handle === "pienso-pollo-adulto");
    expect(pienso?.analytics).toEqual({
      proteina_pct: 26,
      grasa_pct: 15,
      fibra_pct: 2.5,
      cenizas_pct: 7.5,
      humedad_pct: 9,
    });
    expect(pienso?.extraAnalytics).toEqual({ Calcio: "1,2 %" });
    expect(pienso?.variants.map((v) => v.netG)).toEqual([3000, 12000]);

    // Granel: 20 €/kg en pasos de 5 g = 0,10 € el paso; oferta 18 €/kg = 0,09 €
    const alas = prods.products.find((p) => p.handle === "alas-pollo-deshidratadas");
    expect(alas?.bulk).toBe(true);
    expect(alas?.variants[0]).toMatchObject({
      sku: "ALA-POL-DES",
      price: 0.1,
      salePrice: 0.09,
      stock: 2400,
      bulk: { stepG: 5, minG: 100, priceKg: 20, salePriceKg: 18 },
    });

    const taza = prods.products.find((p) => p.handle === "taza-logo");
    expect(taza?.options).toEqual([]);
    expect(taza?.status).toBe("draft");
    expect(taza?.variants[0]?.netMl).toBe(350);
    expect(prods.products.find((p) => p.handle === "guia-cachorro")?.iva).toBe("superreducido");
  });

  it("errores por fila: precio inicial, SKU, combinación, opción incompleta, oferta, columnas", () => {
    const { errors } = readProducts(
      csv([
        "handle,titulo,opcion:Talla,opcion:Color,sku,precio,precio_oferta,coloor",
        "a,A,S,Rojo,A1,,,",
        "a,,S,Rojo,A2,10,,",
        "a,,M,,A1,10,12,",
        "b,B,,,B1,5,,",
        "a,,L,Azul,A9,10,,",
      ]),
    );
    const msgs = errors.map((e) => `${e.line}:${e.column ?? ""}`);
    expect(msgs).toEqual(
      expect.arrayContaining([
        "1:coloor", // columna desconocida
        "2:precio", // primera variante sin precio
        "3:opciones", // combinación repetida
        "4:sku", // SKU repetido
        "4:precio_oferta", // oferta ≥ precio
        "4:opcion:Color", // falta el valor de Color
        "6:handle", // filas del producto no seguidas
      ]),
    );
  });

  it("la herencia no cruza de un producto a otro y aviso de minúscula", () => {
    const { errors, warnings } = readProducts(
      csv(["handle,titulo,sku,precio", "a,Alfa,A1,10", "b,beta,B1,"]),
    );
    expect(errors.map((e) => `${e.line}:${e.column}`)).toEqual(["3:precio"]);
    expect(warnings.map((w) => w.column)).toEqual(["titulo"]);
  });

  it("datos del producto distintos en una fila siguiente = error", () => {
    const { errors } = readProducts(
      csv(["handle,titulo,opcion:Talla,sku,precio", "a,Alfa,S,A1,10", "a,Otro,M,A2,"]),
    );
    expect(errors.map((e) => e.column)).toEqual(["titulo"]);
  });

  it("categorías: ciclo y handle repetido", () => {
    const { errors } = readCategories(csv(["handle,nombre,padre", "a,A,b", "b,B,a", "a,A2,"]));
    expect(errors.map((e) => e.message)).toEqual(
      expect.arrayContaining([expect.stringMatching(/repetido/), expect.stringMatching(/Ciclo/)]),
    );
  });
});

describe("analíticos, neto y granel", () => {
  it("stepPrice: solo céntimos exactos", () => {
    expect(stepPrice(20, 5)).toBe(0.1);
    expect(stepPrice(10, 1)).toBe(0.01);
    expect(stepPrice(0.4, 25)).toBe(0.01);
    expect(stepPrice(19.9, 5)).toBeNull(); // 9,95 céntimos
    expect(stepPrice(19.9, 10)).toBeNull(); // 19,9 céntimos
    expect(stepPrice(19.9, 100)).toBe(1.99);
  });

  it("errores de granel con alternativas; columnas mezcladas", () => {
    const { errors } = readProducts(
      csv([
        "handle,titulo,granel,sku,precio,paso_g,min_g,precio_kg,precio_oferta_kg,stock_g",
        'a,Alfa,sí,A1,,5,12,"19,90",,100',
        "b,Beta,sí,B1,3,5,,20,25,",
        "c,Gamma,,C1,3,5,,,,",
        "d,Delta,sí,D1,,,,,,",
      ]),
    );
    const byCell = Object.fromEntries(errors.map((e) => [`${e.line}:${e.column}`, e.message]));
    expect(Object.keys(byCell).sort()).toEqual([
      "2:min_g",
      "2:precio_kg",
      "3:precio",
      "3:precio_oferta_kg",
      "4:paso_g",
      "5:paso_g",
      "5:precio_kg",
    ]);
    expect(byCell["2:precio_kg"]).toMatch(
      /9,95 céntimos\). Opciones: 18,00 €\/kg · 20,00 €\/kg · paso de 100 g\./,
    );
  });

  it("analíticos: porcentajes, avisos de suma y de humedad, borrar con -", () => {
    const { products, errors, warnings } = readProducts(
      csv([
        "handle,titulo,proteina_pct,grasa_pct,humedad_pct,analitico:Calcio,sku,precio,neto_g,neto_ml",
        'a,Alfa,"60 %",50,,1 %,A1,10,500,',
        "b,Beta,101,-,-,-,B1,10,1,1",
      ]),
    );
    expect(products[0]?.analytics).toEqual({ proteina_pct: 60, grasa_pct: 50 });
    expect(products[1]?.analytics).toEqual({ grasa_pct: null, humedad_pct: null });
    expect(products[1]?.extraAnalytics).toEqual({ Calcio: null });
    expect(errors.map((e) => `${e.line}:${e.column}`)).toEqual(["3:proteina_pct", "3:neto_ml"]);
    expect(warnings.map((w) => w.message)).toEqual([
      expect.stringMatching(/suman 110/),
      expect.stringMatching(/materia seca/),
    ]);
    const meta = productCreateInput(products[0]!, {
      salesChannelId: "sc",
      shippingProfileId: "sp",
      categoryIds: {},
      collectionIds: {},
      tagIds: {},
      typeIds: {},
    } as unknown as Parameters<typeof productCreateInput>[1]).metadata;
    expect(meta).toEqual({ proteina_pct: 60, grasa_pct: 50, "analitico:Calcio": "1 %" });
  });

  it("regla de mínimo en el carrito", () => {
    const rule = bulkRule({ paso_g: 5, min_g: 100 })!;
    expect(bulkMinimumError(rule, 19)).toBe(
      "El mínimo de este producto a granel es 100 g (20 unidades de 5 g).",
    );
    expect(bulkMinimumError(rule, 20)).toBeNull();
    expect(bulkMinimumError(rule, 0)).toBeNull();
    expect(bulkRule({ paso_g: 50 })).toEqual({ stepG: 50, minG: 50 });
    expect(bulkRule({})).toBeNull();
    expect(bulkMinimumError({ stepG: 1, minG: 1000 }, 3)).toBe(
      "El mínimo de este producto a granel es 1 kg.",
    );
    // Precio del mínimo (índice de búsqueda, S-3): 20 pasos de 0,10 €; 5 de 0,07 € (110 g / 25 g)
    expect(bulkMinimumAmount(rule, 0.1)).toBe(2);
    expect(bulkMinimumAmount({ stepG: 25, minG: 110 }, 0.07)).toBe(0.35);
  });

  it("categorías: padre escrito con el nombre → sugiere el handle", () => {
    const { categories, errors, warnings } = readCategories(
      csv([
        "handle,nombre,padre,descripcion",
        "perros,Perros,,",
        "pienso-perro,Pienso,Perros,todo",
      ]),
    );
    expect(errors).toEqual([]);
    expect(warnings.map((w) => w.column)).toEqual(["descripcion"]);
    const plan = planCatalog({ categories, products: [] }, emptyDb());
    expect(plan.errors.map((e) => e.message)).toEqual([
      "No existe la categoría «Perros». ¿Querías decir «perros»? (va el handle, no el nombre)",
    ]);
  });
});

describe("plan", () => {
  const sheet = () =>
    readProducts(
      csv([
        "handle,titulo,categorias,etiquetas,opcion:Talla,sku,precio,precio_oferta,stock",
        "camiseta,Camiseta,ropa,novedad,s,CAM-S,10,,5",
        "camiseta,,,,M,CAM-M,12,9,3",
      ]),
    ).products;

  const dbProduct = (): DbProduct => ({
    id: "prod_1",
    handle: "camiseta",
    title: "Camiseta",
    subtitle: null,
    description: null,
    material: null,
    status: "published",
    type: null,
    collection: null,
    categories: ["ropa"],
    tags: ["novedad"],
    brand: null,
    metadata: {},
    options: [{ id: "opt_talla", title: "Talla", values: [{ id: "v_s", value: "S" }] }],
    variants: [
      {
        id: "var_s",
        sku: "CAM-S",
        ean: null,
        weight: null,
        length: null,
        width: null,
        height: null,
        values: { Talla: "S" },
        prices: [{ id: "price_s", currency_code: "eur", amount: 10, rules_count: 0 }],
        metadata: {},
        requiredQuantity: 1,
      },
    ],
  });

  it("producto nuevo: categoría desconocida = error", () => {
    const plan = planCatalog({ categories: [], products: sheet() }, emptyDb());
    expect(plan.errors.map((e) => e.column)).toEqual(["categorias"]);
  });

  it("producto nuevo: crea opción global, valores y etiquetas que falten", () => {
    const plan = planCatalog(
      { categories: [{ line: 2, handle: "ropa", name: "Ropa" }], products: sheet() },
      emptyDb(),
    );
    expect(plan.errors).toEqual([]);
    expect(plan.categories.create.map((c) => c.handle)).toEqual(["ropa"]);
    expect(plan.options.create).toEqual([{ title: "Talla", values: ["s", "M"] }]);
    expect(plan.tags).toEqual(["novedad"]);
    expect(plan.products.create).toHaveLength(1);
  });

  it("valores sin mayúsculas: usa la grafía de Medusa y solo pide los nuevos", () => {
    const plan = planCatalog(
      { categories: [], products: sheet() },
      emptyDb({
        categories: [
          {
            id: "c1",
            handle: "ropa",
            name: "Ropa",
            description: null,
            rank: 0,
            is_active: true,
            parent_category_id: null,
          },
        ],
        tags: ["Novedad"],
        options: [{ id: "opt_talla", title: "talla", values: [{ id: "v_s", value: "S" }] }],
      }),
    );
    expect(plan.options.create).toEqual([]);
    expect(plan.options.addValues).toEqual([{ id: "opt_talla", title: "talla", values: ["M"] }]);
    expect(plan.tags).toEqual([]);
  });

  it("producto existente: variante nueva, precio cambiado, sin tocar el stock; 2.ª carga sin cambios", () => {
    const db = emptyDb({
      categories: [
        {
          id: "c1",
          handle: "ropa",
          name: "Ropa",
          description: null,
          rank: 0,
          is_active: true,
          parent_category_id: null,
        },
      ],
      tags: ["novedad"],
      options: [{ id: "opt_talla", title: "Talla", values: [{ id: "v_s", value: "S" }] }],
      products: [dbProduct()],
      skuOwners: { "CAM-S": "camiseta" },
    });
    const plan = planCatalog({ categories: [], products: sheet() }, db);
    expect(plan.errors).toEqual([]);
    const [u] = plan.products.update;
    expect(u?.changes).toEqual([]);
    expect(u?.newVariants.map((v) => v.sku)).toEqual(["CAM-M"]);
    expect(u?.linkValues).toEqual([{ optionId: "opt_talla", values: ["M"] }]);
    expect(u?.variants).toEqual([]);

    // Precio distinto: se mandan TODOS los precios (Medusa borra los no mencionados)
    const p2 = sheet();
    p2[0]!.variants[0]!.price = 11;
    const withRule = dbProduct();
    withRule.variants[0]!.prices.push({
      id: "price_vip",
      currency_code: "eur",
      amount: 8,
      rules_count: 1,
    });
    const plan2 = planCatalog({ categories: [], products: p2 }, { ...db, products: [withRule] });
    const vu = plan2.products.update[0]!.variants[0]!;
    expect(vu.changes).toEqual(["precio"]);
    expect(variantUpdateInput(vu, withRule).prices).toEqual([
      { id: "price_vip", currency_code: "eur", amount: 8 },
      { id: "price_s", currency_code: "eur", amount: 11 },
    ]);

    // Hoja igual a Medusa (sin la variante nueva) → sin cambios
    const same = sheet();
    same[0]!.variants.pop();
    const plan3 = planCatalog({ categories: [], products: same }, db);
    expect(plan3.products.unchanged).toBe(1);
    expect(plan3.products.update).toEqual([]);
  });

  it("producto existente con otras opciones = error; SKU de otro producto = error", () => {
    const db = emptyDb({
      categories: [
        {
          id: "c1",
          handle: "ropa",
          name: "Ropa",
          description: null,
          rank: 0,
          is_active: true,
          parent_category_id: null,
        },
      ],
      products: [{ ...dbProduct(), options: [] }],
      skuOwners: { "CAM-M": "otro" },
    });
    const plan = planCatalog({ categories: [], products: sheet() }, db);
    expect(plan.errors.map((e) => e.column)).toEqual(["sku", "opciones"]);
  });

  it("producto sin opciones: «Formato: Única»; recarga sin cambios y precio actualizable", () => {
    const bad = readProducts(csv(["handle,titulo,sku,precio", "taza,Taza,TAZA,9,95"]));
    expect(bad.errors[0]?.message).toMatch(/celdas/);
    const [taza] = readProducts(
      csv(["handle,titulo,sku,precio", 'taza,Taza,TAZA,"9,95"']),
    ).products;
    expect(taza?.options).toEqual([]);
    const db = emptyDb({
      products: [
        {
          ...dbProduct(),
          handle: "taza",
          title: "Taza",
          categories: [],
          tags: [],
          options: [{ id: "opt_f", title: "Formato", values: [{ id: "v_u", value: "Única" }] }],
          variants: [
            {
              ...dbProduct().variants[0]!,
              sku: "TAZA",
              values: { Formato: "Única" },
              prices: [{ id: "price_t", currency_code: "eur", amount: 9, rules_count: 0 }],
            },
          ],
        },
      ],
      skuOwners: { TAZA: "taza" },
    });
    const p9 = { ...taza!, variants: [{ ...taza!.variants[0]!, price: 9 }] };
    const same = planCatalog({ categories: [], products: [p9] }, db);
    expect(same.errors).toEqual([]);
    expect(same.products.unchanged).toBe(1);
    const up = planCatalog({ categories: [], products: [taza!] }, db).products.update[0]!;
    expect(up.variants[0]?.changes).toEqual(["precio"]);
    expect(up.linkValues).toEqual([]);
  });

  it("planSale: crea, cambia y quita según la hoja; ignora SKU sin columna", () => {
    const plan = planSale(
      new Map<string, number | null>([
        ["A", 9],
        ["B", null],
        ["C", 5],
      ]),
      [
        { id: "va", sku: "A", price_set_id: "psa" },
        { id: "vb", sku: "B", price_set_id: "psb" },
        { id: "vc", sku: "C", price_set_id: "psc" },
        { id: "vd", sku: "D", price_set_id: "psd" },
      ],
      [
        { id: "lb", price_set_id: "psb", amount: 3, currency_code: "eur" },
        { id: "lc", price_set_id: "psc", amount: 4, currency_code: "eur" },
        { id: "ld", price_set_id: "psd", amount: 4, currency_code: "eur" },
      ],
    );
    expect(plan).toEqual({
      create: [{ variant_id: "va", amount: 9 }],
      update: [{ id: "lc", variant_id: "vc", amount: 5 }],
      delete: ["lb"],
    });
  });
});

describe("descatalogado y sustituto (Fase E)", () => {
  const refs = {
    salesChannelId: "sc",
    shippingProfileId: "sp",
    categoryIds: {},
    collectionIds: {},
    tagIds: {},
    typeIds: {},
  } as unknown as Parameters<typeof productCreateInput>[1];
  const read = (rows: string[]) =>
    readProducts(csv(["handle,descatalogado,sustituto,sku,precio", ...rows]));

  it("lee sí/no, el sustituto y «-» para borrarlo", () => {
    const { products, errors } = read([
      'viejo,sí,nuevo,V-1,"9,95"',
      'otro,no,-,O-1,"9,95"',
      'nuevo,,,N-1,"9,95"',
    ]);
    expect(errors).toEqual([]);
    expect(products.map((p) => [p.discontinued, p.replacement])).toEqual([
      [true, "nuevo"],
      [false, null],
      [undefined, undefined],
    ]);
    expect(productCreateInput(products[0]!, refs).metadata).toMatchObject({
      descatalogado: true,
      sustituto: "nuevo",
    });
    expect(productCreateInput(products[1]!, refs).metadata).toMatchObject({
      descatalogado: "",
      sustituto: "",
    });
  });

  it("valores no válidos y sustituto inexistente o propio", () => {
    expect(read(['viejo,quizá,Nuevo,V-1,"9,95"']).errors.map((e) => e.column)).toEqual([
      "descatalogado",
      "sustituto",
    ]);
    expect(read(['viejo,sí,viejo,V-1,"9,95"']).errors[0]?.message).toMatch(/propio sustituto/);
    const { products } = read(['viejo,sí,no-existe,V-1,"9,95"']);
    const plan = planCatalog({ categories: [], products }, emptyDb());
    expect(plan.errors.map((e) => e.column)).toContain("sustituto");
    // Existe en Medusa (fuera de la hoja): vale
    const ok = planCatalog(
      { categories: [], products },
      emptyDb({ replacementHandles: ["no-existe"] }),
    );
    expect(ok.errors.map((e) => e.column)).not.toContain("sustituto");
  });
});
