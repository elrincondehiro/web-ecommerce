import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import catalogMock from "./catalog-mock";
import correasSync from "./correas-sync";
import importCatalog from "./import-catalog";
import importImages from "./import-images";
import mockImages from "./mock-images";
import seedStore from "./seed";
import stockMock from "./stock-mock";

/**
 * Catálogo de DESARROLLO completo en un paso (`catalog/mock/LEEME.md`) — solo desarrollo.
 *
 *   pnpm backend:mock:load [N=1000] [fotos]
 *
 * Por orden (todos idempotentes: se puede repetir): seed → catalog:mock N → catalog:import
 * catalog/mock → arneses de prueba (+ sus familias y fotos) → correas:sync catalog/mock/correas →
 * caja de snacks → [fotos de los mocks: images:mock + images:import, se descargan de picsum] →
 * stock:mock. Es lo que esperan los e2e del storefront. Se niega con NODE_ENV=production.
 */
export default async function mockLoad({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  if (process.env.NODE_ENV === "production") {
    throw new Error("mock:load es solo para desarrollo (NODE_ENV=production).");
  }
  const count = (args ?? []).find((a) => /^\d+$/.test(a)) ?? "1000";
  const photos = (args ?? []).includes("fotos");
  const step = async (name: string, run: () => Promise<unknown>) => {
    logger.info(`── mock:load · ${name}`);
    await run();
  };
  const exec = <A extends ExecArgs>(fn: (a: A) => Promise<unknown>, a: string[] = []) =>
    fn({ container, args: a } as A);

  await step("seed", () => exec(seedStore));
  await step(`catalog:mock ${count}`, () => exec(catalogMock, [count]));
  await step("catalog:import catalog/mock", () => exec(importCatalog, ["catalog/mock"]));
  await step("arneses (catalog/mock/arneses)", async () => {
    await exec(importCatalog, ["catalog/mock/arneses"]);
    await exec(importImages, ["catalog/mock/arneses/fotos"]);
  });
  await step("correas:sync catalog/mock/correas", () =>
    exec(correasSync, ["catalog/mock/correas"]),
  );
  await step("caja de snacks (catalog/mock/caja)", () =>
    exec(importCatalog, ["catalog/mock/caja"]),
  );
  if (photos) {
    await step("fotos de los mocks", async () => {
      await exec(mockImages);
      await exec(importImages, [".cache/mock-images"]);
    });
  }
  await step("stock:mock", () => exec(stockMock));
  logger.info(
    `mock:load: hecho${photos ? "" : " (sin fotos de los mocks: añade «fotos» para descargarlas)"}. ` +
      "Reconstruye o reinicia el storefront para verlo.",
  );
}
