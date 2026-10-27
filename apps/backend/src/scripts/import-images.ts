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
 *   Las fotos del producto que no vienen en la carpeta (subidas desde el Admin o importadas
 *   en otra pasada) se conservan detrás.
 * - `replace`: sustituye todas las imágenes del producto por las de la carpeta.
 *   Los objetos antiguos quedan en el bucket (limpieza pendiente, ver docs/fases/fase6.md).
 * - Fase O: `<handle>--<valor>_XX.jpg` = fotos de un valor de la opción `metadata.opcion_fotos`
 *   (p. ej. «Estampado»): van detrás de las generales y se asocian a TODAS las variantes con ese
 *   valor (`batchImageVariantsWorkflow`, Medusa ≥ 2.11.2). Un valor que no existe = aviso.
 * - `dry-run`: solo informa, no sube ni modifica nada.
 * - La ruta de la carpeta es relativa a apps/backend (o absoluta).
 */
import { UPLOAD_FOLDERS, withFolder } from "../lib/upload-folders";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import {
  batchImageVariantsWorkflow,
  updateProductsWorkflow,
  uploadFilesWorkflow,
} from "@medusajs/medusa/core-flows";
import {
  MIME_BY_EXT,
  imageOrder,
  parseImageFileName,
  valueSlug,
  planProductImages,
  sourceFileFromUrl,
  type ParsedImageFile,
  type ProductImagePlan,
} from "./lib/image-files";
import { clearMedusaCache } from "./lib/clear-cache";

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
    fields: [
      "id",
      "handle",
      "thumbnail",
      "metadata",
      "images.id",
      "images.url",
      "images.metadata",
      "variants.id",
      "variants.options.value",
      "variants.options.option.title",
    ],
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

  const stats = { products: 0, uploaded: 0, skipped: 0, linked: 0 };

  type Product = (typeof products)[number];
  /** Fase O: slug del valor → variantes con ese valor en la opción `metadata.opcion_fotos`. */
  function variantsByValue(product: Product): Map<string, string[]> | null {
    const option = product.metadata?.["opcion_fotos"];
    if (typeof option !== "string" || !option) return null;
    const out = new Map<string, string[]>();
    for (const v of product.variants ?? []) {
      const ov = (v?.options ?? []).find((o) => o?.option?.title === option);
      if (!v || !ov?.value) continue;
      const slug = valueSlug(ov.value);
      out.set(slug, [...(out.get(slug) ?? []), v.id]);
    }
    return out;
  }

  /**
   * Asocia cada foto de valor a sus variantes. Idempotente: solo añade las que faltan (Medusa
   * 2.21.2 no evita duplicados en `batchImageVariantsWorkflow`; comprobado en dev).
   */
  async function linkValueImages(
    product: Product,
    item: ProductImagePlan,
    urls: Map<string, string>,
  ) {
    const byValue = variantsByValue(product);
    const valued = item.files.filter((f) => f.value);
    if (!valued.length) return;
    if (!byValue) {
      logger.warn(
        `${item.handle}: fotos por valor sin \`opcion_fotos\` en el producto (se omiten).`,
      );
      return;
    }
    const { data } = await query.graph({
      entity: "product_image",
      fields: ["id", "url", "variants.id"],
      filters: { product_id: product.id },
    });
    const byUrl = new Map(
      (data as { id: string; url: string; variants?: ({ id: string } | null)[] | null }[]).map(
        (i) => [i.url, { id: i.id, linked: new Set((i.variants ?? []).map((v) => v?.id)) }],
      ),
    );
    for (const f of valued) {
      const variants = byValue.get(f.value!);
      if (!variants?.length) {
        logger.warn(
          `${item.handle}: ningún valor «${f.value}» en ${String(product.metadata?.["opcion_fotos"])} (${f.file}).`,
        );
        continue;
      }
      const image = byUrl.get(urls.get(f.file) ?? "");
      const add = variants.filter((id) => !image?.linked.has(id));
      if (!image || !add.length) continue;
      if (!dryRun) {
        await batchImageVariantsWorkflow(container).run({ input: { image_id: image.id, add } });
      }
      stats.linked += add.length;
    }
  }

  async function processProduct(item: ProductImagePlan) {
    const product = byHandle.get(item.handle);
    if (!product) return;
    const existing = (product.images ?? []).filter(Boolean) as ExistingImage[];
    const imported = new Map(
      existing.filter((img) => sourceFile(img)).map((img) => [sourceFile(img) as string, img]),
    );
    const pending = replace ? item.files : item.files.filter((f) => !imported.has(f.file));
    stats.skipped += item.files.length - pending.length;
    if (!pending.length) {
      // Ya subidas: se repasa la asociación a variantes (p. ej. tras añadir variantes nuevas).
      const urls = new Map(item.files.map((f) => [f.file, imported.get(f.file)?.url ?? ""]));
      await linkValueImages(product, item, urls);
      return;
    }
    if (dryRun) {
      stats.products += 1;
      stats.uploaded += pending.length;
      return;
    }

    const { result: uploaded } = await uploadFilesWorkflow(container).run({
      input: {
        files: await Promise.all(
          pending.map(async (f) => ({
            // Carpeta `productos/` del bucket (Fase H, lib/upload-folders.ts). La idempotencia va por
            // `metadata.source_file` (el nombre del fichero local), no por la URL.
            filename: withFolder(UPLOAD_FOLDERS.product, f.file),
            mimeType: MIME_BY_EXT[path.extname(f.file).toLowerCase()] ?? "image/jpeg",
            content: (await readFile(path.join(root, f.file))).toString("base64"),
            access: "public" as const,
          })),
        ),
      },
    });
    const newUrl = new Map(pending.map((f, i) => [f.file, uploaded[i]?.url]));

    // Orden (Fase H): todas las fotos importadas del producto (las de esta carpeta y las de
    // pasadas anteriores) por su nombre `handle[--valor]_XX`, como en `planProductImages`; detrás,
    // las subidas a mano desde el Admin. La primera es la miniatura. Así importar solo `_09` la
    // añade al final sin perder ni reordenar las demás (antes de la Fase H se perdían).
    type Ordered = {
      file: ParsedImageFile;
      image: { id?: string; url: string; metadata: Record<string, unknown> };
    };
    const urlOf = new Map<string, string>();
    const fromFolder = item.files.flatMap((f): Ordered[] => {
      const url = newUrl.get(f.file);
      if (url) {
        urlOf.set(f.file, url);
        return [{ file: f, image: { url, metadata: { source_file: f.file } } }];
      }
      const prev = imported.get(f.file);
      if (!prev) return [];
      urlOf.set(f.file, prev.url);
      return [{ file: f, image: { id: prev.id, url: prev.url, metadata: prev.metadata ?? {} } }];
    });
    const inFolder = new Set(item.files.map((f) => f.file));
    const previous = replace
      ? []
      : existing.flatMap((img): Ordered[] => {
          const src = sourceFile(img);
          const parsed = src && !inFolder.has(src) ? parseImageFileName(src) : null;
          return parsed
            ? [{ file: parsed, image: { id: img.id, url: img.url, metadata: img.metadata ?? {} } }]
            : [];
        });
    const ours = [...fromFolder, ...previous]
      .sort((a, b) => imageOrder(a.file, b.file))
      .map((x) => x.image);
    const manual = replace ? [] : existing.filter((img) => !sourceFile(img));
    const images = [...ours, ...manual.map((img) => ({ id: img.id, url: img.url }))];

    await updateProductsWorkflow(container).run({
      input: {
        products: [{ id: product.id, images, thumbnail: ours[0]?.url ?? product.thumbnail }],
      },
    });
    await linkValueImages(product, item, urlOf);
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
      `${stats.skipped} ya importadas, ${stats.linked} asociaciones nuevas a variantes, ` +
      `${unknown.length} handles desconocidos.`,
  );
  if (!dryRun) await clearMedusaCache(container);
}
