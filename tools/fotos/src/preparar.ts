/**
 * Prepara las fotos del catálogo para `images:import` (herramienta interna, no va en las imágenes
 * de backend ni storefront). Fase 13, docs/fases/fase13-optimizacion.md.
 *
 *   pnpm --filter tools-fotos preparar <carpeta-origen> <carpeta-destino>
 *
 * - Fotos (`handle_01.jpg`, `handle--valor_01.jpg`): giradas según el EXIF, en sRGB, SIN
 *   metadatos (EXIF, GPS, perfil), lado mayor 2000 px (nunca se amplían), JPEG calidad 88
 *   (mozjpeg, progresivo).
 * - Muestras (`handle--valor_muestra.png`): igual, 400 px, PNG con transparencia.
 * - No recorta: la tienda recorta al cuadrado (al centro) en el build. Avisa de las que no son
 *   cuadradas, para revisarlas. No renombra: lo que no sigue la convención se lista y se salta.
 * - No toca los originales. Si el destino ya tiene el fichero, lo sobrescribe.
 * Fuente: context7 /lovell/sharp (autoOrient, salida por defecto en sRGB y sin metadatos, jpeg
 * mozjpeg, png, resize fit inside / withoutEnlargement).
 */
import { mkdir, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { collisions, notSquare, plan } from "./nombres.ts";

// eslint-disable-next-line no-console -- script de terminal
const log = (msg: string) => console.log(msg);

const PHOTO_PX = 2000;
const SWATCH_PX = 400;
const JPEG_QUALITY = 88;

async function main() {
  const base = process.env.INIT_CWD ?? process.cwd();
  const [src, dst] = process.argv.slice(2).map((p) => resolve(base, p));
  if (!src || !dst) throw new Error("Uso: preparar <carpeta-origen> <carpeta-destino>");
  if (src === dst)
    throw new Error("El destino tiene que ser otra carpeta (no se tocan los originales).");
  await mkdir(dst, { recursive: true });

  const files = (await readdir(src, { withFileTypes: true }))
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .sort();
  const items = files.map(plan);
  const skipped = items.filter((i) => !i.output);
  const clash = collisions(items);
  if (clash.length)
    throw new Error(`Varias entradas dan el mismo fichero:\n  ${clash.join("\n  ")}`);

  const warnings: string[] = [];
  let photos = 0;
  let swatches = 0;
  let before = 0;
  let after = 0;
  for (const item of items) {
    if (!item.output) continue;
    const input = join(src, item.input);
    const out = join(dst, item.output);
    const img = sharp(input, { failOn: "error" }).autoOrient();
    const meta = await img.metadata();
    const w = meta.autoOrient?.width ?? meta.width ?? 0;
    const h = meta.autoOrient?.height ?? meta.height ?? 0;
    if (item.kind === "foto") {
      if (notSquare(w, h))
        warnings.push(`${item.input}: ${w}×${h}, no es cuadrada (la tienda la recorta al centro)`);
      if (Math.max(w, h) < 1000)
        warnings.push(`${item.input}: ${w}×${h}, pequeña (mejor ≥ 1500 px)`);
      await img
        .resize(PHOTO_PX, PHOTO_PX, { fit: "inside", withoutEnlargement: true })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
        .toFile(out);
      photos++;
    } else {
      if (!meta.hasAlpha)
        warnings.push(`${item.input}: sin transparencia (la muestra se verá con su fondo)`);
      await img
        .resize(SWATCH_PX, SWATCH_PX, { fit: "inside", withoutEnlargement: true })
        .png({ compressionLevel: 9 })
        .toFile(out);
      swatches++;
    }
    before += (await stat(input)).size;
    after += (await stat(out)).size;
  }

  const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;
  log(`Fotos: ${photos} · muestras: ${swatches} · ${mb(before)} → ${mb(after)} en ${dst}`);
  if (skipped.length)
    log(
      `\nSin procesar (no siguen la convención handle_01.jpg / handle--valor_01.jpg / handle--valor_muestra.png):\n  ${skipped.map((s) => s.input).join("\n  ")}`,
    );
  if (warnings.length) log(`\nRevisar:\n  ${warnings.join("\n  ")}`);
  log(`\nSiguiente: pnpm --filter backend images:import <ruta a ${dst}> dry-run`);
}

main().catch((e: unknown) => {
  // eslint-disable-next-line no-console -- script de terminal
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
