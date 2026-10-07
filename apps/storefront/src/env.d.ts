// Variables de build propias (astro.config.mjs → vite.define).
interface ImportMetaEnv {
  /** CSP por hashes activa (fase 11): los scripts inline propios registran su hash. */
  readonly CSP_ENABLED: boolean;
}
