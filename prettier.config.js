// @ts-check
import base from "@web-ecommerce/config/prettier";

/** @type {import("prettier").Config & import("prettier-plugin-tailwindcss").PluginOptions} */
export default {
  ...base,
  // Tailwind v4 (CSS-first): hoja con @theme para ordenar clases. Relativa a este fichero.
  tailwindStylesheet: "./apps/storefront/src/styles/global.css",
};
