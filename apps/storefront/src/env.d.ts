// Variables de build propias (astro.config.mjs → vite.define).
interface ImportMetaEnv {
  /** CSP por hashes activa (fase 11): los scripts inline propios registran su hash. */
  readonly CSP_ENABLED: boolean;
}

// Datos por petición que pone src/middleware.ts (astro-docs: guides/middleware#middleware-types).
declare namespace App {
  interface Locals {
    /**
     * JWT del cliente con sesión (cookie httpOnly `customer_token`), o null. Solo en páginas
     * on-demand; sin firma verificada (lo hace Medusa en cada petición).
     */
    customerToken?: string | null;
  }
}
