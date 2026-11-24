import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import seedStore from "../../src/scripts/seed";
import importCatalog from "../../src/scripts/import-catalog";
import stockImport from "../../src/scripts/stock-import";
import {
  TEMPLATE_DIR as TEMPLATE,
  templateProductsCsv,
} from "../../src/scripts/lib/catalog-template";

/**
 * `stock:import` (fase 13, catalog/plantilla/stock/): sobre la plantilla del catálogo cargada,
 * la hoja de ejemplo (sumar y fijar por fila, por sku, ean y handle), el modo por defecto
 * (`sumar`, o `fijar` con el argumento), `dry-run`, una hoja con errores (no escribe nada), lo
 * reservado (no se toca) y el granel en gramos.
 */
jest.setTimeout(240 * 1000);

medusaIntegrationTestRunner({
  env: {},
  testSuite: ({ getContainer }) => {
    let container: MedusaContainer;
    let dir: string;

    const stock = async (sku: string) => {
      const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
        entity: "product_variant",
        fields: [
          "inventory_items.inventory.location_levels.stocked_quantity",
          "inventory_items.inventory.location_levels.reserved_quantity",
        ],
        filters: { sku },
      });
      const l = data[0]?.inventory_items?.[0]?.inventory?.location_levels?.[0];
      return { stocked: Number(l?.stocked_quantity), reserved: Number(l?.reserved_quantity) };
    };
    const runStock = (...args: string[]) =>
      stockImport({ container, args } as unknown as Parameters<typeof stockImport>[0]);
    const sheet = async (text: string) => {
      const f = path.join(dir, `stock-${Math.random().toString(36).slice(2)}.csv`);
      await writeFile(f, text);
      return f;
    };

    beforeEach(async () => {
      container = getContainer();
      await seedStore({ container } as Parameters<typeof seedStore>[0]);
      dir = await mkdtemp(path.join(os.tmpdir(), "stock-"));
      await cp(
        path.join(TEMPLATE, "categorias", "categorias.csv"),
        path.join(dir, "categorias.csv"),
      );
      await writeFile(path.join(dir, "productos.csv"), templateProductsCsv());
      await importCatalog({ container, args: [dir] } as unknown as Parameters<
        typeof importCatalog
      >[0]);
    });
    afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    it("la hoja de ejemplo: sumar y fijar por fila, por sku, ean y handle; dry-run no escribe", async () => {
      // Stock de la plantilla: S-AZU 8, L-AZU 0, S-ROJ (EAN …24) 10, taza 25
      const before = {
        sAzu: (await stock("COL-NYL-S-AZU")).stocked,
        lAzu: (await stock("COL-NYL-L-AZU")).stocked,
        sRoj: (await stock("COL-NYL-S-ROJ")).stocked,
        taza: (await stock("TAZA-LOGO")).stocked,
      };
      const example = path.join(TEMPLATE, "stock", "stock.csv");
      await runStock(example, "dry-run");
      expect((await stock("COL-NYL-S-AZU")).stocked).toBe(before.sAzu);

      await runStock(example);
      expect((await stock("COL-NYL-S-AZU")).stocked).toBe(before.sAzu + 5);
      expect((await stock("COL-NYL-L-AZU")).stocked).toBe(12);
      expect((await stock("COL-NYL-S-ROJ")).stocked).toBe(before.sRoj + 3);
      expect((await stock("TAZA-LOGO")).stocked).toBe(20);

      // Con «fijar» en la orden, las filas sin modo fijan (las de «fijar» igual)
      await runStock(example, "fijar");
      expect((await stock("COL-NYL-S-AZU")).stocked).toBe(5);
      expect((await stock("COL-NYL-S-ROJ")).stocked).toBe(3);
    });

    it("con errores no cambia nada; el handle solo vale con una variante", async () => {
      const f = await sheet("sku,handle,stock\nTAZA-LOGO,,7\n,collar-nylon,3\nNO-EXISTE,,1");
      await expect(runStock(f)).rejects.toThrow(/2 errores en la hoja/);
      expect((await stock("TAZA-LOGO")).stocked).toBe(25);
    });

    it("lo reservado no se toca; la misma variante dos veces se aplica en orden", async () => {
      const levels = await container
        .resolve(Modules.INVENTORY)
        .listInventoryLevels({}, { take: 1000 });
      const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
        entity: "product_variant",
        fields: ["inventory_items.inventory_item_id"],
        filters: { sku: "TAZA-LOGO" },
      });
      const item = data[0]!.inventory_items![0]!.inventory_item_id;
      const level = levels.find((l) => l.inventory_item_id === item)!;
      // Reserva como la de un pedido en curso (Inventory Module: reservation item)
      await container
        .resolve(Modules.INVENTORY)
        .createReservationItems([
          { inventory_item_id: item, location_id: level.location_id, quantity: 4 },
        ]);
      const f = await sheet("sku,stock,modo\nTAZA-LOGO,10,fijar\nTAZA-LOGO,2,");
      await runStock(f);
      expect(await stock("TAZA-LOGO")).toEqual({ stocked: 12, reserved: 4 });
    });

    it("granel: en gramos", async () => {
      const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
        entity: "product_variant",
        fields: ["sku", "metadata"],
        filters: {},
      });
      const bulk = data.find((v) => (v.metadata as { paso_g?: number } | null)?.paso_g);
      expect(bulk?.sku).toBeTruthy();
      const before = (await stock(bulk!.sku!)).stocked;
      await runStock(await sheet(`sku,stock\n${bulk!.sku},500`));
      expect((await stock(bulk!.sku!)).stocked).toBe(before + 500);
    });
  },
});
