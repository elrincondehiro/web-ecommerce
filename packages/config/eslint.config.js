// @ts-check
// Config ESLint compartida (flat config). Fuente: typescript-eslint Quickstart (context7).
// Las apps extienden esta base y añaden sus plugins (astro, svelte) en su fase.
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
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
  // Desactiva reglas de estilo que chocan con Prettier (debe ir al final)
  prettier,
]);
