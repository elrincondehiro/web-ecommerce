import { defineConfig, loadEnv } from "@medusajs/framework/utils";

loadEnv(process.env.NODE_ENV || "development", process.cwd());

/**
 * Configuración de Medusa (fase 2).
 * Fuente: docs.medusajs.com (deployment/general, production/worker-mode, infrastructure-modules).
 * - Un único `REDIS_URL` en desarrollo; en producción se pueden separar por módulo.
 * - `MEDUSA_WORKER_MODE`: shared (dev) | server | worker (prod, misma imagen).
 */
type WorkerMode = "shared" | "worker" | "server";

/**
 * `medusa build` también carga este fichero (sin .env en CI/Docker), así que las
 * variables solo se exigen en producción en tiempo de ejecución (NODE_ENV=production).
 * En desarrollo/build se avisa y se usa un valor vacío; los secretos NUNCA tienen
 * valor por defecto inseguro en producción.
 */
const isProduction = process.env.NODE_ENV === "production";
function required(name: string): string {
  const value = process.env[name];
  if (value) return value;
  if (isProduction) {
    throw new Error(`Falta la variable de entorno ${name} (ver apps/backend/.env.example)`);
  }
  return "";
}

const REDIS_URL = required("REDIS_URL");

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: required("DATABASE_URL"),
    redisUrl: REDIS_URL,
    workerMode: (process.env.MEDUSA_WORKER_MODE as WorkerMode | undefined) ?? "shared",
    http: {
      storeCors: required("STORE_CORS"),
      adminCors: required("ADMIN_CORS"),
      authCors: required("AUTH_CORS"),
      jwtSecret: required("JWT_SECRET"),
      cookieSecret: required("COOKIE_SECRET"),
    },
  },
  admin: {
    disable: process.env.DISABLE_MEDUSA_ADMIN === "true",
    backendUrl: process.env.MEDUSA_BACKEND_URL,
  },
  modules: [
    {
      resolve: "@medusajs/medusa/caching",
      options: {
        providers: [
          {
            resolve: "@medusajs/caching-redis",
            id: "caching-redis",
            is_default: true,
            options: { redisUrl: REDIS_URL },
          },
        ],
      },
    },
    {
      resolve: "@medusajs/medusa/event-bus-redis",
      options: { redisUrl: REDIS_URL },
    },
    {
      resolve: "@medusajs/medusa/workflow-engine-redis",
      options: { redis: { redisUrl: REDIS_URL } },
    },
    {
      resolve: "@medusajs/medusa/locking",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/locking-redis",
            id: "locking-redis",
            is_default: true,
            options: { redisUrl: REDIS_URL },
          },
        ],
      },
    },
  ],
});
