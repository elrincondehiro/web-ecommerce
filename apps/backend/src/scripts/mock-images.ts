/**
 * Descarga fotos de PRUEBA para el catálogo mock (fase 6) — solo desarrollo.
 *
 *   pnpm --filter backend images:mock            # 4 fotos por producto mock-*
 *   pnpm --filter backend images:mock 2          # N fotos por producto
 *
 * - Fuente: https://picsum.photos (fotos de Unsplash, NO son productos). Semilla fija por
 *   `<handle>_<XX>`, así que el resultado es repetible.
 * - 2400×1600 (3:2, como una réflex): el storefront recorta a 1:1 por el centro.
 * - Destino: apps/backend/.cache/mock-images/<handle>_<XX>.jpg (ignorado por git).
 *   Después: `pnpm --filter backend images:import .cache/mock-images`.
 * - Omite los ficheros ya descargados. Borrar al terminar: `rm -rf apps/backend/.cache`.
 */
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

const OUT_DIR = path.resolve(".cache/mock-images");
const WIDTH = 2400;
const HEIGHT = 1600;
const CONCURRENCY = 8;

const exists = (file: string) =>
  stat(file).then(
    () => true,
    () => false,
  );

export default async function mockImages({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const perProduct = Math.max(1, Math.min(99, Number.parseInt(args?.[0] ?? "4", 10) || 4));

  const { data: products } = await query.graph({ entity: "product", fields: ["handle"] });
  const handles = products.map((p) => p.handle).filter((h) => h.startsWith("mock-"));
  if (!handles.length) {
    throw new Error("No hay productos mock-*. Ejecuta antes: pnpm --filter backend seed:mock");
  }
  await mkdir(OUT_DIR, { recursive: true });

  const jobs = handles.flatMap((handle) =>
    Array.from({ length: perProduct }, (_, i) => `${handle}_${String(i + 1).padStart(2, "0")}`),
  );
  let downloaded = 0;
  let bytes = 0;
  let skipped = 0;
  const queue = [...jobs];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let name = queue.shift(); name; name = queue.shift()) {
        const file = path.join(OUT_DIR, `${name}.jpg`);
        if (await exists(file)) {
          skipped += 1;
          continue;
        }
        const url = `https://picsum.photos/seed/${encodeURIComponent(name)}/${WIDTH}/${HEIGHT}.jpg`;
        const res = await fetch(url, { redirect: "follow" });
        if (!res.ok) throw new Error(`picsum ${res.status} para ${name}`);
        const body = Buffer.from(await res.arrayBuffer());
        await writeFile(file, body);
        downloaded += 1;
        bytes += body.length;
        if (downloaded % 200 === 0) logger.info(`Fotos mock: ${downloaded}/${jobs.length}…`);
      }
    }),
  );
  logger.info(
    `Fotos mock: ${downloaded} descargadas (${(bytes / 1024 / 1024).toFixed(1)} MB), ` +
      `${skipped} ya existían, en ${path.relative(process.cwd(), OUT_DIR)}`,
  );
}
