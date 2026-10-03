// @ts-check
// Config ESLint compartida (flat config). Fuente: typescript-eslint Quickstart (context7).
// Astro y Svelte: eslint-plugin-astro y eslint-plugin-svelte (flat config, context7).
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import astro from "eslint-plugin-astro";
import svelte from "eslint-plugin-svelte";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores([
    "**/node_modules/",
    "**/dist/",
    "**/build/",
    "**/.astro/",
    "**/.medusa/",
    "**/coverage/",
    "**/.pnpm-store/",
  ]),
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "no-console": "error",
    },
  },
  // Ficheros CommonJS (configs de jest, setup de tests de Medusa): require() permitido
  {
    files: ["**/*.cjs", "**/jest.config.js", "**/integration-tests/setup.js"],
    languageOptions: { sourceType: "commonjs", globals: { ...globals.node } },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  // Tests (jest)
  {
    files: ["**/__tests__/**", "**/*.spec.ts", "**/integration-tests/**"],
    languageOptions: { globals: { ...globals.jest } },
  },
  // Astro: frontmatter y <script> en TS. El plugin busca @typescript-eslint/parser desde el cwd
  // (raíz), donde no está con el linker aislado de pnpm → se fija explícitamente.
  astro.configs.recommended,
  {
    files: ["**/*.astro"],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  // Svelte 5 (runes) con TypeScript en <script lang="ts"> y módulos .svelte.ts
  svelte.configs.recommended,
  {
    files: ["**/*.svelte", "**/*.svelte.ts", "**/*.svelte.js"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        projectService: true,
        extraFileExtensions: [".svelte"],
        parser: tseslint.parser,
      },
    },
  },
  // Desactiva reglas de estilo que chocan con Prettier (debe ir al final)
  prettier,
  svelte.configs.prettier,
]);
