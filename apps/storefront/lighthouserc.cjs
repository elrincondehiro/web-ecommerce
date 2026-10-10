// Lighthouse CI (fase 10-3). `pnpm --filter storefront lhci` tras un build con fixtures.
// Presupuestos de AGENTS.md §3.4: Accesibilidad ≥ 95, SEO 100 (salvo `noindex`, como /carrito/) y
// Buenas prácticas ≥ 95 bloquean; Rendimiento ≥ 95 solo avisa (el runner compartido de CI no es
// estable: ver docs/fases/fase10.md §4.6).
// Móvil (preset por defecto de Lighthouse: 4G lento simulado), mediana de 3 pasadas.
// Chromium: el de Playwright (CHROME_PATH lo lee chrome-launcher). Informes en .lighthouseci/
// (artefacto del job; nada se sube a servidores públicos).
// Fuente: context7 /googlechrome/lighthouse-ci (configuration.md: collect, assertMatrix, upload).
const BASE = "http://127.0.0.1:4330";
// Primer producto de los fixtures (src/lib/__fixtures__/products.json)
const PRODUCT = require("./src/lib/__fixtures__/products.json")[0].handle;

const scores = {
  "categories:accessibility": ["error", { minScore: 0.95, aggregationMethod: "median" }],
  "categories:best-practices": ["error", { minScore: 0.95, aggregationMethod: "median" }],
  "categories:performance": ["warn", { minScore: 0.95, aggregationMethod: "median" }],
};

module.exports = {
  ci: {
    collect: {
      startServerCommand: "node ./scripts/lhci-server.mjs",
      startServerReadyPattern: "lhci-server ready",
      startServerReadyTimeout: 30000,
      url: [`${BASE}/`, `${BASE}/productos/`, `${BASE}/producto/${PRODUCT}/`, `${BASE}/carrito/`],
      numberOfRuns: 3,
      settings: {
        // Contenedor del runner como root: Chromium necesita --no-sandbox
        chromeFlags: "--headless=new --no-sandbox --disable-dev-shm-usage",
      },
    },
    assert: {
      assertMatrix: [
        {
          matchingUrlPattern: "^(?!.*/carrito/).*$",
          assertions: {
            ...scores,
            "categories:seo": ["error", { minScore: 1, aggregationMethod: "median" }],
          },
        },
        // /carrito/ es noindex a propósito: el SEO no se exige
        { matchingUrlPattern: "/carrito/", assertions: scores },
      ],
    },
    upload: { target: "filesystem", outputDir: ".lighthouseci/informes" },
  },
};
