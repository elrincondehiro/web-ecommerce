// Tests unitarios de src/lib (funciones puras). Sin entorno Astro: no importar astro:* aquí.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
