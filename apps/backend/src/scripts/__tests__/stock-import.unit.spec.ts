import { finalLevels, planStock, readStockSheet, type StockVariant } from "../lib/stock-import";

const variant = (o: Partial<StockVariant> & { id: string }): StockVariant => ({
  sku: null,
  ean: null,
  handle: "p",
  title: "Única",
  siblings: 1,
  manageInventory: true,
  level: {
    id: `lvl_${o.id}`,
    inventoryItemId: `ii_${o.id}`,
    locationId: "sloc",
    stocked: 10,
    reserved: 0,
  },
  ...o,
});

describe("stock:import — hoja (fase 13)", () => {
  it("sku, ean o handle; modo por fila y, vacío, el de la orden", () => {
    const { rows, errors } = readStockSheet(
      [
        "# comentario",
        "sku;ean;handle;stock;modo",
        "A-1;;;5;",
        ";8400000000024;;3;fijar",
        ";;collar;2;SUMAR",
        "",
      ].join("\n"),
    );
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { line: 3, sku: "A-1", quantity: 5, mode: "sumar" },
      { line: 4, ean: "8400000000024", quantity: 3, mode: "fijar" },
      { line: 5, handle: "collar", quantity: 2, mode: "sumar" },
    ]);
    expect(readStockSheet("sku,stock\nA,1", "fijar").rows[0]!.mode).toBe("fijar");
  });

  it("errores de la hoja", () => {
    expect(readStockSheet("sku,cantidad\nA,1").errors.map((e) => e.message)).toEqual([
      "Columnas desconocidas: cantidad.",
      "Falta la columna stock.",
    ]);
    expect(readStockSheet("stock\n1").errors[0]!.message).toMatch(/sku, ean o handle/);
    const bad = readStockSheet("sku,stock,modo\n,1,\nA,-1,\nB,2,quitar\nC,1.5,");
    expect(bad.errors.map((e) => e.line)).toEqual([2, 3, 4, 5]);
    expect(bad.rows).toEqual([]);
  });
});

describe("stock:import — plan (fase 13)", () => {
  const db = [
    variant({ id: "v1", sku: "A-1", ean: "111", handle: "collar", siblings: 2 }),
    variant({ id: "v2", sku: "A-2", handle: "collar", siblings: 2 }),
    variant({ id: "v3", sku: "B-1", handle: "taza" }),
    variant({ id: "v4", sku: "C-1", handle: "caja", manageInventory: false, level: null }),
    variant({
      id: "v5",
      sku: "D-1",
      handle: "pienso",
      level: {
        id: "lvl_v5",
        inventoryItemId: "ii_v5",
        locationId: "sloc",
        stocked: 10,
        reserved: 4,
      },
    }),
  ];
  const plan = (text: string, mode?: "sumar" | "fijar") =>
    planStock(readStockSheet(text, mode).rows, db);

  it("sumar y fijar; por sku (sin mayúsculas), ean o handle de una sola variante", () => {
    const p = plan("sku,ean,handle,stock,modo\na-1,,,5,\n,111,,2,fijar\n,,taza,3,fijar");
    expect(p.errors).toEqual([]);
    expect(p.changes.map((c) => [c.variant.id, c.before, c.after])).toEqual([
      ["v1", 10, 15],
      ["v1", 15, 2],
      ["v3", 10, 3],
    ]);
    // Repetida: aviso; se aplica el último valor
    expect(p.warnings[0]!.message).toMatch(/ya estaba en la línea 2/);
    expect(finalLevels(p.changes)).toEqual([
      { id: "lvl_v1", inventory_item_id: "ii_v1", location_id: "sloc", stocked_quantity: 2 },
      { id: "lvl_v3", inventory_item_id: "ii_v3", location_id: "sloc", stocked_quantity: 3 },
    ]);
  });

  it("errores: no existe, handle con varias variantes, sin control de stock", () => {
    const p = plan("sku,handle,stock\nZZ,,1\n,collar,1\nC-1,,1\n,nada,1");
    expect(p.errors.map((e) => e.message)).toEqual([
      "No hay ninguna variante con el SKU «ZZ».",
      "«collar» tiene varias variantes: indica el sku o el ean de cada una.",
      "«C-1» no lleva control de stock (sin_stock o sin inventario).",
      "No hay ningún producto «nada».",
    ]);
    expect(p.changes).toEqual([]);
  });

  it("avisos: sku y ean que no coinciden; fijar por debajo de lo reservado; sin cambios", () => {
    const p = plan("sku,ean,stock,modo\nA-2,111,0,\nD-1,,2,fijar\nB-1,,10,fijar");
    expect(p.warnings.map((w) => w.message)).toEqual([
      "El EAN no es el de ese SKU: se usa el SKU.",
      expect.stringMatching(/2 es menos que lo reservado por pedidos en curso \(4\)/),
    ]);
    expect(p.unchanged).toBe(2); // sumar 0 y fijar el mismo
    expect(p.changes.map((c) => c.after)).toEqual([2]);
  });
});
