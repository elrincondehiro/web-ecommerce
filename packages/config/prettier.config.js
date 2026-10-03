// @ts-check
// Config Prettier compartida. Plugins: astro, svelte y tailwind (este último debe ir el último).
import { fileURLToPath } from "node:url";

// Rutas absolutas: Prettier resuelve los nombres desde la config que la importa (raíz), y los
// plugins son dependencias de este paquete.
const plugin = (/** @type {string} */ name) => fileURLToPath(import.meta.resolve(name));

/** @type {import("prettier").Config} */
export default {
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  printWidth: 100,
  plugins: [
    plugin("prettier-plugin-astro"),
    plugin("prettier-plugin-svelte"),
    plugin("prettier-plugin-tailwindcss"),
  ],
  overrides: [
    { files: "*.astro", options: { parser: "astro" } },
    { files: "*.svelte", options: { parser: "svelte" } },
  ],
};
