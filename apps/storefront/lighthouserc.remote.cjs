// Lighthouse contra un DESPLIEGUE (fase 11-9): `LHCI_BASE=https://… pnpm --filter storefront lhci:remote`.
// Mismo preset que CI (móvil, 4G lento simulado, mediana de 3) pero con el catálogo, las imágenes de
// R2, Caddy y Cloudflare reales. La IP de las pruebas tiene un Bypass en Cloudflare Access (regla
// temporal): no se envían cabeceras (`extraHeaders` irían también a R2 y a otros orígenes).
// SEO solo AVISA: el entorno de prueba lleva `X-Robots-Tag: noindex` (Caddy, ROBOTS=noindex) y
// Lighthouse lo penaliza a propósito. El resto, como en CI (lighthouserc.cjs).
// Chromium: el de Playwright (CHROME_PATH). Informes en .lighthouseci/remoto (no se suben).
// Fuente: context7 /googlechrome/lighthouse-ci (configuration.md: collect.url, assertMatrix).
const BASE = (process.env.LHCI_BASE ?? "https://hirobordercollie.es").replace(/\/$/, "");

const scores = {
  "categories:accessibility": ["error", { minScore: 0.95, aggregationMethod: "median" }],
  "categories:best-practices": ["error", { minScore: 0.95, aggregationMethod: "median" }],
  "categories:performance": ["warn", { minScore: 0.95, aggregationMethod: "median" }],
  "categories:seo": ["warn", { minScore: 1, aggregationMethod: "median" }],
};

module.exports = {
  ci: {
    collect: {
      url: [
        `${BASE}/`,
        `${BASE}/productos/`,
        `${BASE}/categoria/perro/`,
        `${BASE}/categoria/piensos-perro/`,
        `${BASE}/producto/mock-pienso-premium-001/`,
        `${BASE}/producto/mock-premios-plus-010/`,
        `${BASE}/producto/correa-a-medida/`,
        `${BASE}/producto/correa-verde-pvc/`,
        `${BASE}/carrito/`,
      ],
      numberOfRuns: 3,
      settings: { chromeFlags: "--headless=new --no-sandbox --disable-dev-shm-usage" },
    },
    assert: { assertMatrix: [{ matchingUrlPattern: ".*", assertions: scores }] },
    upload: { target: "filesystem", outputDir: ".lighthouseci/remoto" },
  },
};
