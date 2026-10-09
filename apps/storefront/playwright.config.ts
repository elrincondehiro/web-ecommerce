// e2e del storefront (fase 4). Solo en local por ahora (entra en CI en la fase 10).
// Requisitos: `pnpm infra:up`, `pnpm dev:backend`, apps/storefront/.env con COOKIE_SECURE=false
// y un build (`pnpm --filter storefront build`; vale STOREFRONT_MAX_PRODUCTS=100). Antes,
// `pnpm backend:stock:mock` si los e2e de checkout ya han gastado stock. globalSetup espera a
// que el backend responda de forma estable (e2e/global-setup.ts).
// Navegador: Chromium 1243 ya instalado en ~/.cache/ms-playwright (revisión de 1.63.0).
// Fuente: context7 /microsoft/playwright (test-configuration, emulation, webServer).
import { defineConfig, devices } from "@playwright/test";

const PORT = 4321;
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  // Comparten backend (stock, carritos): en serie y sin reintentos para ver fallos reales.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: "list",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    { name: "escritorio", use: { ...devices["Desktop Chrome"] } },
    { name: "movil", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "pnpm start",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
