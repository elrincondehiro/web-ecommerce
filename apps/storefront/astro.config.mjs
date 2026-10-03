// @ts-check
// Config validada contra astro-docs (Astro 7): on-demand rendering, @astrojs/node, server islands,
// Fonts API, astro:env, prefetch, sitemap e imágenes. Ver docs/fases/fase3.md.
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
const SITE_URL =
  process.env.SITE_URL ??
  (existsSync(envFile) ? parseEnv(readFileSync(envFile, "utf8")).SITE_URL : undefined);

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
      weights: ["100 900"],
      styles: ["normal"],
      subsets: ["latin"],
      fallbacks: ["sans-serif"],
    },
  ],
  image: {
    // Imágenes del backend en dev (SeaweedFS/Medusa). El dominio de R2 se añade en la fase 6.
    domains: ["localhost"],
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
    },
  },
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: { $lib: fileURLToPath(new URL("./src/lib", import.meta.url)) },
    },
  },
});
