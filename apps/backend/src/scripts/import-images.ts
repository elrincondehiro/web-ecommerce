/**
 * Importa fotos de producto en lote (fase 6).
 *
 *   pnpm --filter backend images:import <carpeta> [dry-run] [replace]
 *
 * - Ficheros `<handle>_<XX>.jpg|jpeg` (ver lib/image-files.ts). `_01` = miniatura.
 * - Sube cada foto con el módulo de ficheros (SeaweedFS en dev, R2 en prod) mediante
 *   `uploadFilesWorkflow` y la asocia al producto con `updateProductsWorkflow`.
 * - Idempotente: cada imagen guarda `metadata.source_file` (y, como respaldo, el nombre se
 *   deduce de la URL `<nombre>-<ULID>.jpg`); las ya importadas se omiten.
 *   Las imágenes subidas desde el Admin (sin nombre `handle_XX`) se conservan detrás.
 * - `replace`: sustituye todas las imágenes del producto por las de la carpeta.
 *   Los objetos antiguos quedan en el bucket (limpieza pendiente, ver docs/fases/fase6.md).
 * - `dry-run`: solo informa, no sube ni modifica nada.
 * - La ruta de la carpeta es relativa a apps/backend (o absoluta).
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { updateProductsWorkflow, uploadFilesWorkflow } from "@medusajs/medusa/core-flows";
import {
  MIME_BY_EXT,
  planProductImages,
  sourceFileFromUrl,
  type ProductImagePlan,
} from "./lib/image-files";

const PRODUCT_CONCURRENCY = 4;

interface ExistingImage {
  id: string;
  url: string;
  metadata?: Record<string, unknown> | null;
}

const sourceFile = (img: ExistingImage) =>
  typeof img.metadata?.source_file === "string"
    ? img.metadata.source_file
    : sourceFileFromUrl(img.url);

export default async function importImages({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const FLAGS = ["dry-run", "replace"];
  const dir = args.find((a) => !FLAGS.includes(a));
  const dryRun = args.includes("dry-run");
  const replace = args.includes("replace");
  if (!dir) {
    throw new Error("Uso: images:import <carpeta> [dry-run] [replace]");
  }
  const root = path.resolve(dir);
  const entries = (await readdir(root, { withFileTypes: true }))
    .filter((e) => e.isFile())
    .map((e) => e.name);
  const plan = planProductImages(entries);
  if (plan.ignored.length) {
    logger.warn(`Ignorados ${plan.ignored.length} ficheros fuera de la convención handle_XX.jpg`);
  }
  if (plan.duplicates.length) {
    logger.warn(`Duplicados (misma posición): ${plan.duplicates.join(", ")}`);
  }

  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "thumbnail", "images.id", "images.url", "images.metadata"],
    filters: { handle: plan.products.map((p) => p.handle) },
  });
  const byHandle = new Map(products.map((p) => [p.handle, p]));
  const unknown = plan.products.filter((p) => !byHandle.has(p.handle));
  if (unknown.length) {
    logger.warn(
      `Sin producto en Medusa (se omiten): ${unknown
        .slice(0, 20)
        .map((p) => p.handle)
        .join(", ")}${unknown.length > 20 ? "…" : ""}`,
    );
  }

  const stats = { products: 0, uploaded: 0, skipped: 0 };

  async function processProduct(item: ProductImagePlan) {
    const product = byHandle.get(item.handle);
    if (!product) return;
    const existing = (product.images ?? []).filter(Boolean) as ExistingImage[];
    const imported = new Map(
      existing.filter((img) => sourceFile(img)).map((img) => [sourceFile(img) as string, img]),
    );
    const pending = replace ? item.files : item.files.filter((f) => !imported.has(f.file));
    stats.skipped += item.files.length - pending.length;
    if (!pending.length) return;
    if (dryRun) {
      stats.products += 1;
      stats.uploaded += pending.length;
      return;
    }

    const { result: uploaded } = await uploadFilesWorkflow(container).run({
      input: {
        files: await Promise.all(
          pending.map(async (f) => ({
            filename: f.file,
            mimeType: MIME_BY_EXT[path.extname(f.file).toLowerCase()] ?? "image/jpeg",
            content: (await readFile(path.join(root, f.file))).toString("base64"),
            access: "public" as const,
          })),
        ),
      },
    });
    const newUrl = new Map(pending.map((f, i) => [f.file, uploaded[i]?.url]));

    // Orden: fotos de la carpeta por posición; después, las subidas a mano desde el Admin.
    const ours = item.files
      .map((f) => {
        const url = newUrl.get(f.file);
        if (url) return { url, metadata: { source_file: f.file } };
        const prev = imported.get(f.file);
        return prev ? { id: prev.id, url: prev.url, metadata: prev.metadata ?? {} } : null;
      })
      .filter((img): img is NonNullable<typeof img> => img !== null);
    const manual = replace ? [] : existing.filter((img) => !sourceFile(img));
    const images = [...ours, ...manual.map((img) => ({ id: img.id, url: img.url }))];

    await updateProductsWorkflow(container).run({
      input: {
        products: [{ id: product.id, images, thumbnail: ours[0]?.url ?? product.thumbnail }],
      },
    });
    stats.products += 1;
    stats.uploaded += pending.length;
  }

  const queue = [...plan.products];
  const total = queue.length;
  let done = 0;
  await Promise.all(
    Array.from({ length: PRODUCT_CONCURRENCY }, async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        await processProduct(item);
        done += 1;
        if (done % 50 === 0) logger.info(`Imágenes: ${done}/${total} productos procesados…`);
      }
    }),
  );

  logger.info(
    `${dryRun ? "[dry-run] " : ""}Imágenes: ${stats.uploaded} subidas en ${stats.products} productos, ` +
      `${stats.skipped} ya importadas, ${unknown.length} handles desconocidos.`,
  );
}
