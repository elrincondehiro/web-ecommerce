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

/**
 * Ficheros (fase 6): `file-s3` contra SeaweedFS (dev) o Cloudflare R2 (prod), mismas variables.
 * Fuente: docs.medusajs.com (infrastructure-modules/file/s3) + código de @medusajs/file-s3 2.21.2.
 * - Sin S3_BUCKET (CI, `medusa build`) se usa el proveedor local por defecto de Medusa.
 * - `acl: false`: ni SeaweedFS ni R2 usan ACLs por objeto; la lectura pública es del bucket
 *   (SeaweedFS: `s3.anonymous.set`; R2: dominio público). Los ficheros privados NO deben ir aquí.
 */
const S3_BUCKET = process.env.S3_BUCKET;
const fileModule = S3_BUCKET
  ? [
      {
        resolve: "@medusajs/medusa/file",
        options: {
          providers: [
            {
              resolve: "@medusajs/medusa/file-s3",
              id: "s3",
              options: {
                file_url: required("S3_FILE_URL"),
                access_key_id: required("S3_ACCESS_KEY_ID"),
                secret_access_key: required("S3_SECRET_ACCESS_KEY"),
                region: process.env.S3_REGION ?? "auto",
                bucket: S3_BUCKET,
                endpoint: required("S3_ENDPOINT"),
                prefix: process.env.S3_PREFIX ?? "",
                acl: false,
                cache_control: "public, max-age=31536000, immutable",
                additional_client_config: {
                  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
                },
              },
            },
          ],
        },
      },
    ]
  : [];

/**
 * Pagos (fase 5): proveedor oficial Stripe (`@medusajs/medusa/payment-stripe`, provider id
 * `pp_stripe_stripe`, webhook en `/hooks/payment/stripe_stripe`).
 * Fuente: context7 /medusajs/medusa (commerce-modules/payment/payment-provider/stripe) + tipos de
 * @medusajs/payment-stripe 2.21.2 (`StripeOptions`).
 * - Sin STRIPE_API_KEY (CI, `medusa build`) no se registra: Medusa arranca sin Stripe.
 * - `capture: false`: solo se AUTORIZA al pagar; la captura se hace desde el Admin (fase 5, P1).
 * - `automaticPaymentMethods`: los métodos los decide el Dashboard de Stripe.
 * - `webhookSecret` obligatorio en producción (verificación de firma de los webhooks).
 */
const STRIPE_API_KEY = process.env.STRIPE_API_KEY;
const paymentModule = STRIPE_API_KEY
  ? [
      {
        resolve: "@medusajs/medusa/payment",
        options: {
          providers: [
            {
              resolve: "@medusajs/medusa/payment-stripe",
              id: "stripe",
              options: {
                apiKey: STRIPE_API_KEY,
                webhookSecret: required("STRIPE_WEBHOOK_SECRET"),
                capture: false,
                automaticPaymentMethods: true,
              },
            },
          ],
        },
      },
    ]
  : [];

/**
 * Búsqueda (fase 7-1, decisión D1 = A): Search Module con Meilisearch como único proveedor,
 * vía el proveedor de `@rokmohar/medusa-plugin-meilisearch` (sin registrar el plugin completo).
 * Fuente: docs.medusajs.com/llms-full.txt (Search Module, Search Module Providers) + README
 * del plugin 2.3.1. Índices en `src/search/*`; se llenan solo en modo shared/worker.
 * - La master key de Meilisearch solo la ve el backend; el storefront usa `POST /store/search`.
 * - Sin MEILISEARCH_HOST (tests de integración, `medusa build` en CI) no se registra y Medusa
 *   usa su proveedor PostgreSQL por defecto: Jest no puede cargar `meilisearch` (solo ESM).
 *   El índice no fija `provider`, así que usa el proveedor por defecto que haya.
 */
// En producción es obligatoria: nunca caer en silencio al proveedor PostgreSQL.
const MEILISEARCH_HOST = isProduction ? required("MEILISEARCH_HOST") : process.env.MEILISEARCH_HOST;
const searchModule = MEILISEARCH_HOST
  ? [
      {
        resolve: "@medusajs/medusa/search",
        options: {
          providers: [
            {
              resolve: "@rokmohar/medusa-plugin-meilisearch/providers/meilisearch",
              id: "meilisearch",
              options: {
                config: {
                  host: MEILISEARCH_HOST,
                  apiKey: required("MEILISEARCH_API_KEY"),
                },
              },
            },
          ],
        },
      },
    ]
  : [];

/**
 * Emails (fase 8): Notification Module con el proveedor propio `resend-notification`, canal `email`
 * (plantillas de `packages/emails`). Fuente: context7 /medusajs/medusa (Notification Module,
 * create notification module provider, guía Resend).
 * - EMAIL_TRANSPORT=resend → API de Resend (RESEND_API_KEY); =smtp → Mailpit (solo desarrollo).
 * - Sin EMAIL_TRANSPORT (CI, tests, `medusa build`) no se registra: Medusa no envía emails y los
 *   subscribers lo detectan y no hacen nada. En producción es obligatorio.
 * - Sin reply-to por ahora (el dominio no recibe correo); el pie de los emails lo avisa.
 */
const EMAIL_TRANSPORT = isProduction ? required("EMAIL_TRANSPORT") : process.env.EMAIL_TRANSPORT;
const notificationModule = EMAIL_TRANSPORT
  ? [
      {
        resolve: "@medusajs/medusa/notification",
        options: {
          providers: [
            // Proveedor por defecto de Medusa para el panel de avisos del Admin (canal `feed`):
            // al configurar el módulo se sustituye la config por defecto, así que se repite.
            {
              resolve: "@medusajs/medusa/notification-local",
              id: "local",
              options: { name: "Local Notification Provider", channels: ["feed"] },
            },
            {
              resolve: "./src/modules/resend-notification",
              id: "resend",
              options: {
                channels: ["email"],
                transport: EMAIL_TRANSPORT,
                from: required("EMAIL_FROM"),
                ...(process.env.EMAIL_REPLY_TO ? { replyTo: process.env.EMAIL_REPLY_TO } : {}),
                ...(EMAIL_TRANSPORT === "resend" ? { apiKey: required("RESEND_API_KEY") } : {}),
                smtpHost: process.env.SMTP_HOST ?? "localhost",
                smtpPort: Number(process.env.SMTP_PORT ?? 1025),
              },
            },
          ],
        },
      },
    ]
  : [];

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
    // Enlaces de los emails de cliente (reset de contraseña, verificación, pedido).
    storefrontUrl: process.env.STOREFRONT_URL,
  },
  modules: [
    ...fileModule,
    ...paymentModule,
    ...searchModule,
    ...notificationModule,
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
