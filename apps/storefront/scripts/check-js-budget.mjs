// Presupuesto de JS del storefront (AGENTS.md §3.4). Se ejecuta tras `pnpm build`.
// Home, listados y fichas: 0 bundles /_astro/*.js salvo UN bundle de carrito (CartClient,
// ≤ 2 KB gzip, fase 4) sin imports a otros chunks. Se permite el script inline de las server
// islands (lo genera Astro) y el aplicador de LiveSync, ≤ 1 KB gzip en total.
import { readFile, readdir } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const ROOT = fileURLToPath(new URL("../dist/client/", import.meta.url));
/** Rutas con presupuesto 0 KB (prefijos relativos a dist/client). */
const ZERO_JS = [/^index\.html$/, /^productos\//, /^categorias\//, /^producto\//, /^404\.html$/];
/** Máximo de JS inline (gzip) por página: solo el runtime de server islands. */
const INLINE_GZIP_MAX = 1024;
/** Único bundle permitido en esas páginas: mejora progresiva del carrito (fase 4). */
const CART_BUNDLE = /^CartClient\.[^/]*\.js$/;
const CART_GZIP_MAX = 2048;
const CLIENT = fileURLToPath(new URL("../dist/client", import.meta.url));

/** @type {Map<string, number>} */
const bundleSizes = new Map();
/** @param {string} src */
async function cartBundleGzip(src) {
  let size = bundleSizes.get(src);
  if (size === undefined) {
    const code = await readFile(join(CLIENT, src), "utf8");
    // Sin imports estáticos ni dinámicos: el bundle debe ser autocontenido.
    size = /\bimport\s*[("'{*]|\bfrom\s*["']/.test(code) ? Infinity : gzipSync(code).length;
    bundleSizes.set(src, size);
  }
  return size;
}

/** @param {string} dir @returns {AsyncGenerator<string>} */
async function* htmlFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(path);
    else if (entry.name.endsWith(".html")) yield path;
  }
}

const SCRIPT_SRC = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
const MODULEPRELOAD = /<link\b[^>]*\brel=["']modulepreload["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi;
const INLINE = /<script\b(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;

let checked = 0;
const failures = [];
for await (const file of htmlFiles(ROOT)) {
  const rel = relative(ROOT, file);
  if (!ZERO_JS.some((re) => re.test(rel))) continue;
  checked++;
  const html = await readFile(file, "utf8");
  const bundles = [...html.matchAll(SCRIPT_SRC), ...html.matchAll(MODULEPRELOAD)].map((m) => m[1]);
  const inline = [...html.matchAll(INLINE)]
    .filter((m) => !/type=["']application\/ld\+json["']/i.test(m[1] ?? ""))
    .map((m) => m[2] ?? "")
    .join("\n");
  const inlineGzip = inline ? gzipSync(inline).length : 0;
  const others = bundles.filter((b) => !CART_BUNDLE.test(basename(b)));
  const cart = bundles.filter((b) => CART_BUNDLE.test(basename(b)));
  if (others.length) failures.push(`${rel}: bundles JS no permitidos ${others.join(", ")}`);
  if (cart.length > 1) failures.push(`${rel}: más de un bundle de carrito ${cart.join(", ")}`);
  for (const src of new Set(cart)) {
    const gz = await cartBundleGzip(src);
    if (gz > CART_GZIP_MAX)
      failures.push(
        `${rel}: bundle de carrito ${src} ${gz} B gzip > ${CART_GZIP_MAX} B (o con imports)`,
      );
  }
  if (inlineGzip > INLINE_GZIP_MAX)
    failures.push(`${rel}: JS inline ${inlineGzip} B gzip > ${INLINE_GZIP_MAX} B`);
}

if (checked === 0) {
  process.stderr.write("check-js-budget: no hay HTML en dist/client (¿falta `pnpm build`?)\n");
  process.exit(1);
}
if (failures.length) {
  process.stderr.write(
    `check-js-budget: ${failures.length} incumplimientos\n${failures.join("\n")}\n`,
  );
  process.exit(1);
}
const cartInfo = [...bundleSizes].map(([src, gz]) => `${basename(src)} ${gz} B gzip`).join(", ");
process.stdout.write(
  `check-js-budget: OK (${checked} páginas; único bundle permitido: ${cartInfo || "ninguno"})\n`,
);
