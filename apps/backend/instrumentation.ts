import * as Sentry from "@sentry/node";
import { errorReportingOptions } from "./src/lib/error-reporting";

/**
 * Errores de la aplicación a Bugsink (fase 12-B, docs/fases/fase12.md). Medusa importa este
 * fichero al arrancar (`medusa start`/`develop`, server y worker) y llama a `register()`.
 * Solo errores, sin trazas ni OpenTelemetry (la guía oficial de Sentry para Medusa añade trazas;
 * Bugsink no las usa). Sin SENTRY_DSN no hace nada. Qué llega: los errores 5xx de las rutas API
 * (`errorHandler` de src/api/middlewares.ts) y los errores no capturados del proceso
 * (integraciones por defecto del SDK). Los `catch` de subscribers y jobs que solo registran un
 * aviso con el logger no llegan (son fallos esperados y controlados).
 * Fuente: context7 /medusajs/medusa (integrations/guides/sentry: instrumentation.ts y
 * errorHandler) y código de @medusajs/medusa 2.22.7 (`commands/start.js`,
 * `registerInstrumentation`).
 */
const service = process.env.MEDUSA_WORKER_MODE === "worker" ? "backend-worker" : "backend-server";
const options = errorReportingOptions(process.env, service);
if (options) Sentry.init(options);

export function register() {
  // Nada más que registrar: Sentry ya está iniciado arriba (antes que el resto de módulos).
}
