// @ts-check
// Config validada contra astro-docs (Astro 7): on-demand rendering, @astrojs/node, server islands,
// Fonts API, astro:env, prefetch, sitemap e imágenes. Ver docs/fases/fase3.md y fase6.md.
import node from "@astrojs/node";
import sitemap from "@astrojs/sitemap";
import svelte from "@astrojs/svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, envField, fontProviders } from "astro/config";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, rename, rmdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

// `site` se necesita al cargar la config (sitemap, canonical), antes de que exista astro:env.
// Prioridad: variable de entorno > apps/storefront/.env > dominio de producción.
const envFile = fileURLToPath(new URL("./.env", import.meta.url));
const dotenv = existsSync(envFile) ? parseEnv(readFileSync(envFile, "utf8")) : {};
const SITE_URL = process.env.SITE_URL ?? dotenv.SITE_URL;
// Origen público de las imágenes de producto (bucket SeaweedFS/R2). Solo se optimizan en build
// las imágenes de ese origen (image.remotePatterns). Fase 6.
const IMAGE_BASE_URL = new URL(
  process.env.IMAGE_BASE_URL ?? dotenv.IMAGE_BASE_URL ?? "http://localhost:8333/medusa",
);

/**
 * CSP por hashes de Astro (`security.csp`), prevista para la fase 11. Una sola constante activa la
 * CSP y, vía `import.meta.env.CSP_ENABLED`, el registro de hashes de los scripts inline propios
 * (LiveSync, ThemeInit). Sin CSP no se toca `Astro.csp`: Astro avisa en cada página del build si
 * se usa sin CSP configurada (astro 7.3.5, core/fetch/fetch-state.js getCsp).
 */
const CSP_ENABLED = false;

const LEGAL_PATHS = ["/condiciones/", "/privacidad/", "/cookies/", "/aviso-legal/"];

/**
 * Manifiestos del build FUERA de lo público. Endpoints prerenderizados los escriben en dist/client
 * (lo que se sirve); al terminar el build se mueven a dist/server, que solo lee el servidor
 * (lib/build-manifest.ts):
 *   - buscar/tarjetas.json → card-images.json (miniaturas de /buscar/, fase 7-1, D6)
 *   - ofertas/paginas.json → offer-pages.json (clave → ids de /ofertas/, I-Interficie)
 * Fuente: astro-docs (integrations-reference: astro:config:done `config.build.server`,
 * astro:build:done `dir` = salida del cliente; comprobado en astro 7.3.5 integrations/hooks.js).
 * @returns {import("astro").AstroIntegration}
 */
function privateBuildManifests() {
  const MANIFESTS = [
    { from: "buscar/tarjetas.json", to: "card-images.json" },
    { from: "ofertas/paginas.json", to: "offer-pages.json" },
  ];
  /** @type {URL | undefined} */
  let serverDir;
  return {
    name: "private-build-manifests",
    hooks: {
      "astro:config:done": ({ config }) => {
        serverDir = config.build.server;
      },
      "astro:build:done": async ({ dir, logger }) => {
        if (!serverDir) return;
        await mkdir(serverDir, { recursive: true });
        for (const m of MANIFESTS) {
          const from = new URL(m.from, dir);
          if (!existsSync(from)) continue;
          const to = new URL(m.to, serverDir);
          await rename(from, to);
          // Carpeta vacía (p. ej. dist/client/buscar/, /buscar/ es on-demand): fuera
          const folder = new URL("./", from);
          if (!(await readdir(folder)).length) await rmdir(folder);
          logger.info(`${m.from} → ${fileURLToPath(to)} (no público)`);
        }
      },
    },
  };
}

export default defineConfig({
  site: SITE_URL || "https://elrincondehiro.com",
  // Estático por defecto; las server islands y rutas on-demand las sirve el adapter.
  adapter: node({ mode: "standalone" }),
  trailingSlash: "always",
  // Sitemap sin páginas legales provisionales (noindex hasta tener el texto definitivo, fase 5).
  integrations: [
    svelte(),
    sitemap({
      filter: (page) => !LEGAL_PATHS.some((p) => page.endsWith(p)) && !page.includes("/buscar/"),
    }),
    privateBuildManifests(),
  ],
  // Sin prefetch de Astro: inyecta /_astro/page.*.js en todas las páginas y el presupuesto
  // es 0 bundles JS en home/listado/ficha. Se sustituirá por Speculation Rules (fase 13).
  prefetch: false,
  // Sin sesiones de Astro: el carrito va en una cookie httpOnly propia (fase 4). Excluye el
  // runtime de sesiones del bundle de servidor (astro-docs: configuration-reference#session).
  session: false,
  fonts: [
    // I-Marca: titulares Baloo 2 y texto Nunito Sans (reemplazan a Inter). Ficheros estáticos de
    // los pesos usados (no la variable completa); solo se precarga el del texto base (BaseLayout).
    // font-display: swap (por defecto) + fallback con métricas ajustadas → CLS 0. Fase 6.
    {
      provider: fontProviders.fontsource(),
      name: "Nunito Sans",
      cssVariable: "--font-nunito-sans",
      weights: [400, 600, 700],
      styles: ["normal"],
      subsets: ["latin"],
      fallbacks: ["sans-serif"],
    },
    {
      provider: fontProviders.fontsource(),
      name: "Baloo 2",
      cssVariable: "--font-baloo",
      weights: [600, 700],
      styles: ["normal"],
      subsets: ["latin"],
      fallbacks: ["sans-serif"],
    },
  ],
  image: {
    // AVIF effort 2 (sharp por defecto: 4). Medido en fase 6 (100 productos, 4400 transformaciones):
    // build en frío 14m41s → 2m55s con AVIF solo ~4 % más pesados. Ver docs/fases/fase6.md.
    service: {
      entrypoint: "astro/assets/services/sharp",
      config: { avif: { effort: 2 } },
    },
    remotePatterns: [
      {
        protocol: IMAGE_BASE_URL.protocol.replace(":", ""),
        hostname: IMAGE_BASE_URL.hostname,
        ...(IMAGE_BASE_URL.port ? { port: IMAGE_BASE_URL.port } : {}),
        pathname: `${IMAGE_BASE_URL.pathname.replace(/\/$/, "")}/**`,
      },
    ],
  },
  env: {
    schema: {
      MEDUSA_BACKEND_URL: envField.string({
        context: "server",
        access: "public",
        default: "http://localhost:9000",
      }),
      MEDUSA_PUBLISHABLE_KEY: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
      // Atributo Secure de la cookie del carrito. false SOLO para probar por http en local.
      COOKIE_SECURE: envField.boolean({
        context: "server",
        access: "public",
        default: true,
      }),
      // Clave PUBLICABLE de Stripe (pk_test_… / pk_live_…) para el Payment Element (fase 5). Es
      // pública por diseño: se escribe en un data- del paso de pago. Sin ella, el pago se desactiva.
      PUBLIC_STRIPE_PUBLISHABLE_KEY: envField.string({
        context: "server",
        access: "public",
        optional: true,
        startsWith: "pk_",
      }),
      // "fixtures" → datos de build desde src/lib/__fixtures__ (CI sin Medusa)
      STOREFRONT_DATA: envField.enum({
        context: "server",
        access: "public",
        values: ["medusa", "fixtures"],
        default: "medusa",
      }),
      // Limita el catálogo del build a los N primeros productos (por título). Para medir builds
      // con un subconjunto o previsualizar rápido. Sin definir → catálogo completo.
      // Cabecera Server-Timing (tiempos de búsqueda/tarjetas/render) en /buscar/ y su fragmento.
      // Apagada por defecto (limpieza en producción); se activa en runtime para medir. `secret`
      // no por ser secreta sino para leerla en RUNTIME (las `public` de servidor se fijan en el
      // build).
      SERVER_TIMING: envField.boolean({
        context: "server",
        access: "secret",
        default: false,
      }),
      // Caché en memoria de tarjetas de /buscar/ (precio/stock por id; lib/card-cache.ts). En
      // segundos; 0 = desactivada (siempre fresco). Fase 7-1, D9.
      SEARCH_CARD_CACHE_TTL: envField.number({
        context: "server",
        access: "secret",
        int: true,
        min: 0,
        default: 30,
      }),
      // Caché en memoria de /buscar/sugerencias/ (HTML por texto, 500 entradas). En segundos;
      // 0 = desactivada. Se suma a la de Cloudflare (fase 11, fase7.md §2.7). Fase 7-2.
      SEARCH_SUGGEST_CACHE_TTL: envField.number({
        context: "server",
        access: "secret",
        int: true,
        min: 0,
        default: 60,
      }),
      STOREFRONT_MAX_PRODUCTS: envField.number({
        context: "server",
        access: "public",
        int: true,
        min: 1,
        optional: true,
      }),
    },
  },
  ...(CSP_ENABLED ? { security: { csp: true } } : {}),
  vite: {
    define: { "import.meta.env.CSP_ENABLED": JSON.stringify(CSP_ENABLED) },
    plugins: [tailwindcss()],
    build: {
      // Scripts propios que van como bundle en /_astro/ (caché inmutable, se descargan una vez)
      // en vez de inline en cada HTML (Astro inlinea scripts < 4 KB): carrito (CartClient,
      // fase 4), /buscar/ (SearchLive, fase 7-1) y JS común de la web (SiteClient: sugerencias,
      // fase 7-2), arrastre de carruseles (ScrollDrag, Fase D) y /carrito/ (CartLive, Fase D).
      // Resto: por defecto (undefined).
      assetsInlineLimit: (/** @type {string} */ file) =>
        /CartClient|CartLive|SearchLive|SiteClient|ScrollDrag/.test(file) ? false : undefined,
    },
    resolve: {
      alias: { $lib: fileURLToPath(new URL("./src/lib", import.meta.url)) },
    },
  },
});
