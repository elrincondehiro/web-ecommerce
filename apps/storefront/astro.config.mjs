// @ts-check
// Config validada contra astro-docs (Astro 7): on-demand rendering, @astrojs/node, server islands,
// Fonts API, astro:env, prefetch, sitemap e imágenes. Ver docs/fases/fase3.md y fase6.md.
import node from "@astrojs/node";
import sitemap from "@astrojs/sitemap";
import svelte from "@astrojs/svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, envField, fontProviders } from "astro/config";
import { existsSync, readFileSync } from "node:fs";
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

const LEGAL_PATHS = ["/condiciones/", "/privacidad/", "/cookies/", "/aviso-legal/"];

export default defineConfig({
  site: SITE_URL || "https://elrincondehiro.com",
  // Estático por defecto; las server islands y rutas on-demand las sirve el adapter.
  adapter: node({ mode: "standalone" }),
  trailingSlash: "always",
  // Sitemap sin páginas legales provisionales (noindex hasta tener el texto definitivo, fase 5).
  integrations: [
    svelte(),
    sitemap({ filter: (page) => !LEGAL_PATHS.some((p) => page.endsWith(p)) }),
  ],
  // Sin prefetch de Astro: inyecta /_astro/page.*.js en todas las páginas y el presupuesto
  // es 0 bundles JS en home/listado/ficha. Se sustituirá por Speculation Rules (fase 13).
  prefetch: false,
  // Sin sesiones de Astro: el carrito va en una cookie httpOnly propia (fase 4). Excluye el
  // runtime de sesiones del bundle de servidor (astro-docs: configuration-reference#session).
  session: false,
  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: "Inter",
      cssVariable: "--font-inter",
      // Ficheros estáticos de los pesos usados (400/500/600, ~24 KB c/u) en vez del variable
      // 100–900 (72 KB): solo se precarga el 400 (BaseLayout), que ya no compite con la imagen LCP.
      // font-display: swap (por defecto) + fallback con métricas ajustadas → CLS 0. Fase 6.
      weights: [400, 500, 600],
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
      STOREFRONT_MAX_PRODUCTS: envField.number({
        context: "server",
        access: "public",
        int: true,
        min: 1,
        optional: true,
      }),
    },
  },
  vite: {
    plugins: [tailwindcss()],
    build: {
      // El script del carrito (CartClient.astro, ~1 KB gzip) va como bundle en /_astro/ (caché
      // inmutable, se descarga una vez para todo el sitio) en vez de inline en cada HTML (Astro
      // inlinea scripts < 4 KB). Resto: comportamiento por defecto (undefined). Fase 4.
      assetsInlineLimit: (/** @type {string} */ file) =>
        file.includes("CartClient") ? false : undefined,
    },
    resolve: {
      alias: { $lib: fileURLToPath(new URL("./src/lib", import.meta.url)) },
    },
  },
});
