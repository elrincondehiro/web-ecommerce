// Presupuesto de JS del storefront (AGENTS.md §3.4). Se ejecuta tras `pnpm build`.
// Home, listados y fichas: 0 bundles /_astro/*.js referenciados (scripts o modulepreload).
// Se permite el script inline de las server islands (lo genera Astro, < 1 KB, sin bundle).
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const ROOT = fileURLToPath(new URL("../dist/client/", import.meta.url));
/** Rutas con presupuesto 0 KB (prefijos relativos a dist/client). */
const ZERO_JS = [/^index\.html$/, /^productos\//, /^categorias\//, /^producto\//, /^404\.html$/];
/** Máximo de JS inline (gzip) por página: solo el runtime de server islands. */
const INLINE_GZIP_MAX = 1024;

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
  if (bundles.length) failures.push(`${rel}: bundles JS ${bundles.join(", ")}`);
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
process.stdout.write(`check-js-budget: OK (${checked} páginas con 0 bundles JS)\n`);
