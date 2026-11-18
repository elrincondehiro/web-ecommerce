// Errores del servidor del storefront a Bugsink (fase 12-B, docs/fases/fase12.md). Se carga ANTES
// que el servidor de Astro con `node --import ./instrument.mjs ./dist/server/entry.mjs` (Dockerfile
// y `pnpm start`), como recomienda el SDK. Sin SENTRY_DSN no hace nada. Solo servidor: nada llega
// al navegador ni al build (no se usa @sentry/astro, que añade plugins de Vite al build).
// Las opciones y el filtro de datos personales: src/lib/error-reporting.ts (idéntico al del
// backend), que Node 24 carga sin compilar (type stripping; la imagen copia ese fichero).
// Fuente: context7 /getsentry/sentry-javascript (docs/v8-node: `node --import ./instrument.mjs`).
import * as Sentry from "@sentry/node";

if (process.env.SENTRY_DSN?.trim()) {
  const { errorReportingOptions } = await import("./src/lib/error-reporting.ts");
  const options = errorReportingOptions(process.env, "storefront");
  if (options) Sentry.init(options);
}
