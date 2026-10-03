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

export default defineConfig({
  site: SITE_URL || "https://elrincondehiro.com",
  // Estático por defecto; las server islands y rutas on-demand las sirve el adapter.
  adapter: node({ mode: "standalone" }),
  trailingSlash: "always",
  integrations: [svelte(), sitemap()],
  // Sin prefetch de Astro: inyecta /_astro/page.*.js en todas las páginas y el presupuesto
  // es 0 bundles JS en home/listado/ficha. Se sustituirá por Speculation Rules (fase 13).
  prefetch: false,
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
    resolve: {
      alias: { $lib: fileURLToPath(new URL("./src/lib", import.meta.url)) },
    },
  },
});
