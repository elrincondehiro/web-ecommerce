/**
 * Genera el catálogo de PRUEBA (Fase S) — solo desarrollo.
 *
 *   pnpm --filter backend catalog:mock [N]          # N productos (300 por defecto)
 *   pnpm --filter backend catalog:import catalog/mock dry-run
 *   pnpm --filter backend catalog:import catalog/mock
 *   pnpm --filter backend images:mock && pnpm --filter backend images:import .cache/mock-images
 *
 * Lee el árbol de `catalog/mock/categorias.csv` (versionado) y escribe
 * `catalog/mock/productos.csv` (ignorado por git) con productos `mock-*` en sus hojas. No
 * escribe en Medusa: la carga la hace `catalog:import` (mismo camino que el catálogo real).
 * Reglas del generador en `lib/catalog-mock.ts`.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { buildMockCatalog } from "./lib/catalog-mock";
import { CATEGORIES_FILE, PRODUCTS_FILE, readCategories } from "./lib/catalog-sheet";
import { decodeUtf8, parseCsv } from "./lib/csv";

const DIR = path.resolve("catalog/mock");

export default async function catalogMock({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const count = Math.max(1, Math.min(5000, Number.parseInt(args?.[0] ?? "300", 10) || 300));
  const { categories, errors } = readCategories(
    parseCsv(decodeUtf8(await readFile(path.join(DIR, CATEGORIES_FILE)))),
  );
  if (errors.length) throw new Error(`${CATEGORIES_FILE}: ${errors[0]?.message}`);
  const mock = buildMockCatalog(categories, count);
  await writeFile(path.join(DIR, PRODUCTS_FILE), mock.csv, "utf8");
  logger.info(
    `catalog/mock/${PRODUCTS_FILE}: ${mock.products} productos (${mock.variants} variantes), ` +
      `${mock.sale} en oferta, ${mock.featured} destacados, ${mock.bulk} a granel (borrador). ` +
      "Siguiente: catalog:import catalog/mock",
  );
}
