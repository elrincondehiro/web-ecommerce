// Presupuesto de JS del storefront (AGENTS.md §3.4). Se ejecuta tras `pnpm build`.
// Home, listados y fichas: 0 bundles /_astro/*.js salvo, sin imports a otros chunks:
//   - UN bundle de carrito (CartClient, ≤ 2 KB gzip, fase 4);
//   - UN bundle común de la web (SiteClient, ≤ 1,5 KB gzip, fase 7-2: sugerencias), OBLIGATORIO
//     (va en BaseLayout; también en carrito/checkout/pedido, comprobado en e2e/sugerencias).
// Se permite el script inline de las server
// islands (lo genera Astro) y el aplicador de LiveSync, ≤ 1,2 KB gzip en total (margen: las props
// cifradas de las islands cambian de longitud en cada build).
// /buscar/ es on-demand (no hay HTML en dist): se comprueba aquí su bundle SearchLive (≤ 1 KB
// gzip, sin imports; fase 7-1) y en el e2e (e2e/buscar.spec.ts) que la página no carga otros.
// Páginas legales (fase 5): mismas reglas. Checkout (fase 5, on-demand: no hay HTML en dist): el
// bundle de pago (StripePayment, incluye el cargador de Stripe.js) ≤ 30 KB gzip propios con sus
// imports (AGENTS §3.4); Stripe.js se descarga aparte de js.stripe.com.
import { readFile, readdir } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const ROOT = fileURLToPath(new URL("../dist/client/", import.meta.url));
/** Rutas con presupuesto 0 KB (prefijos relativos a dist/client). */
const ZERO_JS = [
  /^index\.html$/,
  /^productos\//,
  /^categorias\//,
  /^producto\//,
  /^404\.html$/,
  /^(condiciones|privacidad|cookies|aviso-legal)\//,
];
/** Bundle de pago del checkout (fase 5) y su presupuesto (gzip, con imports). */
const PAYMENT_BUNDLE = /^StripePayment\.[^/]*\.js$/;
const PAYMENT_GZIP_MAX = 30 * 1024;
/** Máximo de JS inline (gzip) por página: runtime de server islands + LiveSync. */
const INLINE_GZIP_MAX = 1229;
/** Bundles permitidos en esas páginas (máx. uno de cada; `required`: en todas). */
const PAGE_BUNDLES = [
  { name: "carrito", re: /^CartClient\.[^/]*\.js$/, max: 2048, required: false },
  { name: "común", re: /^SiteClient\.[^/]*\.js$/, max: 1536, required: true },
];
/** Mejora progresiva de /buscar/ (modelo híbrido, fase 7-1). */
const SEARCH_BUNDLE = /^SearchLive\.[^/]*\.js$/;
const SEARCH_GZIP_MAX = 1024;
const CLIENT = fileURLToPath(new URL("../dist/client", import.meta.url));

/** @type {Map<string, number>} */
const bundleSizes = new Map();
/** @param {string} src */
async function selfContainedGzip(src) {
  const code = await readFile(join(CLIENT, src), "utf8");
  // Sin imports estáticos ni dinámicos: el bundle debe ser autocontenido.
  return /\bimport\s*[("'{*]|\bfrom\s*["']/.test(code) ? Infinity : gzipSync(code).length;
}
/** @param {string} src */
async function bundleGzip(src) {
  let size = bundleSizes.get(src);
  if (size === undefined) {
    size = await selfContainedGzip(src);
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
  const others = bundles.filter((b) => !PAGE_BUNDLES.some(({ re }) => re.test(basename(b))));
  if (others.length) failures.push(`${rel}: bundles JS no permitidos ${others.join(", ")}`);
  for (const { name, re, max, required } of PAGE_BUNDLES) {
    const found = [...new Set(bundles.filter((b) => re.test(basename(b))))];
    if (found.length > 1) failures.push(`${rel}: más de un bundle ${name} ${found.join(", ")}`);
    if (required && !found.length) failures.push(`${rel}: falta el bundle ${name}`);
    for (const src of found) {
      const gz = await bundleGzip(src);
      if (gz > max)
        failures.push(`${rel}: bundle ${name} ${src} ${gz} B gzip > ${max} B (o con imports)`);
    }
  }
  if (inlineGzip > INLINE_GZIP_MAX)
    failures.push(`${rel}: JS inline ${inlineGzip} B gzip > ${INLINE_GZIP_MAX} B`);
}

// Checkout: el bundle de pago y todo lo que importe (chunks de /_astro/).
const ASSETS = join(CLIENT, "_astro");
const assets = await readdir(ASSETS).catch(() => []);
const payment = assets.filter((f) => PAYMENT_BUNDLE.test(f));
let paymentInfo = "sin bundle de pago";
if (payment.length !== 1) {
  failures.push(`checkout: se esperaba 1 bundle de pago y hay ${payment.length}`);
} else {
  /** @type {Set<string>} */
  const seen = new Set();
  /** @param {string} file */
  const walk = async (file) => {
    if (seen.has(file)) return 0;
    seen.add(file);
    const code = await readFile(join(ASSETS, file), "utf8");
    let size = gzipSync(code).length;
    for (const m of code.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["']\.\/([^"']+\.js)["']/g)) {
      size += await walk(m[1] ?? "");
    }
    return size;
  };
  const gz = await walk(payment[0] ?? "");
  paymentInfo = `pago ${[...seen].join(" + ")} ${gz} B gzip`;
  if (gz > PAYMENT_GZIP_MAX)
    failures.push(`checkout: bundle de pago ${gz} B gzip > ${PAYMENT_GZIP_MAX} B`);
}

const search = assets.filter((f) => SEARCH_BUNDLE.test(f));
let searchInfo = "sin bundle de búsqueda";
if (search.length !== 1) {
  failures.push(`buscar: se esperaba 1 bundle SearchLive y hay ${search.length}`);
} else {
  const gz = await selfContainedGzip(join("_astro", search[0] ?? ""));
  searchInfo = `buscar ${search[0]} ${gz} B gzip`;
  if (gz > SEARCH_GZIP_MAX)
    failures.push(`buscar: ${search[0]} ${gz} B gzip > ${SEARCH_GZIP_MAX} B (o con imports)`);
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
  `check-js-budget: OK (${checked} páginas; bundles: ${cartInfo || "ninguno"}; ${searchInfo}; ${paymentInfo})\n`,
);
