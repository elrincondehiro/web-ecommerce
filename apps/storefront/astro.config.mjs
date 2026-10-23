// @ts-check
// Config validada contra astro-docs (Astro 7): on-demand rendering, @astrojs/node, server islands,
// Fonts API, astro:env, prefetch, sitemap e imágenes. Ver docs/fases/fase3.md y fase6.md.
import node from "@astrojs/node";
import sitemap from "@astrojs/sitemap";
import svelte from "@astrojs/svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, envField, fontProviders } from "astro/config";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, rename, rm, rmdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { astroRedirects } from "./src/lib/redirects.mjs";

// `site` se necesita al cargar la config (sitemap, canonical), antes de que exista astro:env.
// Prioridad: variable de entorno > apps/storefront/.env > dominio de producción. `||` y no `??`:
// una variable vacía (p. ej. un ARG de Docker sin valor, fase 10) cuenta como no definida.
const envFile = fileURLToPath(new URL("./.env", import.meta.url));
const dotenv = existsSync(envFile) ? parseEnv(readFileSync(envFile, "utf8")) : {};
const SITE_URL = process.env.SITE_URL || dotenv.SITE_URL;
// Origen público de las imágenes de producto (bucket SeaweedFS/R2). Solo se optimizan en build
// las imágenes de ese origen (image.remotePatterns). Fase 6.
const IMAGE_BASE_URL = new URL(
  process.env.IMAGE_BASE_URL || dotenv.IMAGE_BASE_URL || "http://localhost:8333/medusa",
);

/**
 * CSP por hashes de Astro (`security.csp`, fase 11-3). Una sola constante activa la CSP y, vía
 * `import.meta.env.CSP_ENABLED`, el registro de hashes de los scripts/estilos inline propios
 * (LiveSync, ThemeInit, SwatchStyles). Sin CSP no se toca `Astro.csp`: Astro avisa en cada página
 * del build si se usa sin CSP configurada (astro 7.3.5, core/fetch/fetch-state.js getCsp).
 * Astro la pone en un `<meta>` (script-src/style-src con hashes + `CSP_DIRECTIVES`); lo que no vale
 * en `<meta>` (frame-ancestors, base-uri, form-action, object-src) va en cabecera desde Caddy.
 */
const CSP_ENABLED = true;

/**
 * Directivas de la CSP además de script-src/style-src (que Astro rellena con 'self' + hashes).
 * Stripe.js: docs.stripe.com/security/guide#content-security-policy (MCP stripe). Sin
 * maps.googleapis.com (no usamos Address Element) ni link.com (Link no está activado).
 * img-src: imágenes de producto (IMAGE_BASE_URL: R2 en producción) e iconos de Stripe.
 * Fuente: astro-docs (configuration-reference#securitycsp, directives, scriptDirective.resources).
 * @type {Extract<NonNullable<import("astro").AstroUserConfig["security"]>["csp"], object>["directives"] & {}}
 */
const CSP_DIRECTIVES = [
  "default-src 'self'",
  `img-src 'self' data: ${IMAGE_BASE_URL.origin} https://*.stripe.com`,
  "font-src 'self'",
  "connect-src 'self' https://api.stripe.com",
  "frame-src https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com",
];
const CSP_SCRIPT_RESOURCES = ["'self'", "https://js.stripe.com", "https://*.js.stripe.com"];

/**
 * Datos de prueba (P4 del análisis del JS, docs/analisis-js.md): con `STOREFRONT_DATA=fixtures`
 * (CI sin backend) el catálogo sale de src/lib/__fixtures__. Se sustituye en el build como
 * constante (`import.meta.env.USE_FIXTURES`): con `medusa` los `import()` de las fixtures son
 * código muerto y no entran en `dist/server` (271 KB de products.json, solo limpieza). Mismo valor
 * que `astro:env` (variable de entorno > .env; por defecto `medusa`).
 */
const USE_FIXTURES = (process.env.STOREFRONT_DATA || dotenv.STOREFRONT_DATA) === "fixtures";

/**
 * Hosts de confianza para las rutas on-demand (`security.allowedDomains`, fase 10). Detrás de Caddy,
 * Astro solo acepta `Host`/`X-Forwarded-Host`/`X-Forwarded-Proto` que coincidan; si no, usa
 * `localhost` y las URL generadas (redirecciones, `Astro.url`) llevarían el host interno.
 * Se fija en el build a partir de SITE_URL (el dominio público). Sin SITE_URL (CI con fixtures),
 * vacío = comportamiento por defecto de Astro.
 * Fuente: astro-docs (configuration-reference#securityalloweddomains) + astro 7.3.8
 * core/app/node.js (createRequestFromNodeRequest).
 */
/** @param {string} raw */
const domainPattern = (raw) => {
  const url = new URL(raw);
  return {
    hostname: url.hostname,
    protocol: url.protocol.replace(":", ""),
    ...(url.port ? { port: url.port } : {}),
  };
};
/**
 * Hosts extra SOLO para desarrollo (p. ej. probar desde el móvil por la IP de la LAN):
 * DEV_ALLOWED_HOSTS=192.168.1.39:4321 (lista separada por comas; sin protocolo = http). Sin esto,
 * Astro trata la petición como `localhost` y el control CSRF (`checkOrigin`) rechaza los
 * formularios: por http fuera de localhost el navegador no envía `Sec-Fetch-Site` y el `Origin`
 * (la IP) no coincide. Vacía en producción. Fuente: astro-docs (security.checkOrigin) + astro
 * 7.3.8 core/app/origin-check.js.
 */
const DEV_ALLOWED_HOSTS = (process.env.DEV_ALLOWED_HOSTS || dotenv.DEV_ALLOWED_HOSTS || "")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean)
  .map((h) => domainPattern(/^https?:\/\//.test(h) ? h : `http://${h}`));
/** @type {Array<{ hostname: string; protocol: string; port?: string }>} */
const ALLOWED_DOMAINS = [...(SITE_URL ? [domainPattern(SITE_URL)] : []), ...DEV_ALLOWED_HOSTS];

const LEGAL_PATHS = [
  "/condiciones/",
  "/condiciones-puntos/",
  "/privacidad/",
  "/cookies/",
  "/aviso-legal/",
];

/**
 * Manifiestos del build FUERA de lo público. Endpoints prerenderizados los escriben en dist/client
 * (lo que se sirve); al terminar el build se mueven a dist/server, que solo lee el servidor
 * (lib/build-manifest.ts):
 *   - buscar/tarjetas.json → card-images.json (miniaturas de /buscar/, fase 7-1, D6)
 *   - listados/paginas.json → listing-pages.json (clave → ids de cada página de listado para
 *     LiveSync: categorías, /productos/, /ofertas/, home; Fase S, D-S1)
 *   - listados/categorias.json → shop-categories.json (árbol de categorías sin las vacías, para
 *     las páginas on-demand; Fase S)
 *   - listados/opciones.json → hidden-options.json (opciones con `metadata.filtrable = false`,
 *     para /buscar/; Fase O)
 * Fuente: astro-docs (integrations-reference: astro:config:done `config.build.server`,
 * astro:build:done `dir` = salida del cliente; comprobado en astro 7.3.5 integrations/hooks.js).
 * @returns {import("astro").AstroIntegration}
 */
function privateBuildManifests() {
  const MANIFESTS = [
    { from: "buscar/tarjetas.json", to: "card-images.json" },
    { from: "listados/paginas.json", to: "listing-pages.json" },
    { from: "listados/categorias.json", to: "shop-categories.json" },
    { from: "listados/correas.json", to: "correa-cards.json" },
    { from: "listados/opciones.json", to: "hidden-options.json" },
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
          if (existsSync(folder) && !(await readdir(folder)).length) await rmdir(folder);
          logger.info(`${m.from} → ${fileURLToPath(to)} (no público)`);
        }
      },
    },
  };
}

/**
 * Datos del sitemap (Fase E): `lastmod` de las fichas y fichas fuera del sitemap (descatalogadas).
 * Los escribe el endpoint prerenderizado `listados/sitemap.json` (src/pages/listados/sitemap.json.ts).
 * Esta integración va ANTES de `sitemap()` en la lista: los hooks `astro:build:done` corren en
 * orden, así que el JSON se lee antes de que @astrojs/sitemap llame a `serialize`. Luego se borra
 * (no es público). Fuente: astro-docs (integrations-reference: orden de los hooks;
 * integrations-guide/sitemap#serialize) + @astrojs/sitemap 3.7.4 dist/index.js.
 */
/** @type {{ lastmod: Record<string, string>; exclude: Set<string> }} */
const sitemapInfo = { lastmod: {}, exclude: new Set() };
/** @returns {import("astro").AstroIntegration} */
function sitemapData() {
  return {
    name: "sitemap-data",
    hooks: {
      "astro:build:done": async ({ dir }) => {
        const file = new URL("listados/sitemap.json", dir);
        if (!existsSync(file)) return;
        const data = JSON.parse(readFileSync(file, "utf8"));
        sitemapInfo.lastmod = data.lastmod ?? {};
        sitemapInfo.exclude = new Set(data.exclude ?? []);
        await rm(file);
      },
    },
  };
}

/** @param {string} url */
const sitemapPath = (url) => new URL(url).pathname;

export default defineConfig({
  site: SITE_URL || "https://elrincondehiro.com",
  // Estático por defecto; las server islands y rutas on-demand las sirve el adapter.
  adapter: node({ mode: "standalone" }),
  trailingSlash: "always",
  // Sin Shiki: sus estilos inline no son compatibles con la CSP (astro-docs, security.csp) y el
  // contenido (src/content) no tiene bloques de código.
  markdown: { syntaxHighlight: false },
  // Redirecciones 301 (Fase E): src/lib/redirects.mjs. El build falla si el mapa no es válido.
  redirects: astroRedirects(),
  // Sitemap sin páginas legales provisionales (noindex hasta tener el texto definitivo, fase 5),
  // sin fichas descatalogadas y con `lastmod` en las fichas (Fase E, `sitemapData`).
  integrations: [
    svelte(),
    sitemapData(),
    sitemap({
      filter: (page) =>
        !LEGAL_PATHS.some((p) => page.endsWith(p)) &&
        !page.includes("/buscar/") &&
        !page.includes("/listados/"),
      serialize: (item) => {
        const path = sitemapPath(item.url);
        if (sitemapInfo.exclude.has(path)) return undefined;
        const lastmod = sitemapInfo.lastmod[path];
        return lastmod ? { ...item, lastmod } : item;
      },
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
      // URL de la API de Medusa. `secret` no por ser secreta sino para leerla en RUNTIME (las
      // `public` de servidor se fijan en el build): en Docker el build y el contenedor pueden usar
      // URL distintas (pública / red interna `http://backend-server:9000`). Fase 10.
      MEDUSA_BACKEND_URL: envField.string({
        context: "server",
        access: "secret",
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
      // `secret` para leerla en RUNTIME (/checkout/ es on-demand): la misma imagen sirve para test
      // y live (fase 10). El prefijo PUBLIC_ no la expone: Astro trata las `secret` del esquema
      // como privadas aunque coincidan con `envPrefix` (astro 7.3.8 env/env-loader.js).
      PUBLIC_STRIPE_PUBLISHABLE_KEY: envField.string({
        context: "server",
        access: "secret",
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
  security: {
    ...(ALLOWED_DOMAINS.length ? { allowedDomains: ALLOWED_DOMAINS } : {}),
    ...(CSP_ENABLED
      ? {
          csp: {
            directives: CSP_DIRECTIVES,
            scriptDirective: { resources: CSP_SCRIPT_RESOURCES },
          },
        }
      : {}),
  },
  vite: {
    define: {
      "import.meta.env.CSP_ENABLED": JSON.stringify(CSP_ENABLED),
      "import.meta.env.USE_FIXTURES": JSON.stringify(USE_FIXTURES),
    },
    plugins: [tailwindcss()],
    build: {
      // Scripts propios que van como bundle en /_astro/ (caché inmutable, se descargan una vez)
      // en vez de inline en cada HTML (Astro inlinea scripts < 4 KB): carrito (CartClient,
      // fase 4), /buscar/ (SearchLive, fase 7-1) y JS común de la web (SiteClient: sugerencias,
      // fase 7-2), arrastre de carruseles (ScrollDrag, Fase D), /carrito/ (CartLive, Fase D) y
      // configurador de la correa a medida (CorreaLive, Fase E-2c).
      // Resto: por defecto (undefined).
      assetsInlineLimit: (/** @type {string} */ file) =>
        /CartClient|CartLive|CorreaLive|SearchLive|SiteClient|ScrollDrag/.test(file)
          ? false
          : undefined,
    },
    resolve: {
      alias: { $lib: fileURLToPath(new URL("./src/lib", import.meta.url)) },
    },
  },
});
