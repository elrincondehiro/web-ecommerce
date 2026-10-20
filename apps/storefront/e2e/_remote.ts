// e2e contra un despliegue (fase 11-9): `E2E_BASE_URL=https://… pnpm --filter storefront test:e2e`.
// - Sin `webServer` (la tienda ya está servida) ni backend local (global-setup mira /health/).
// - Emails a `delivered+<etiqueta>@resend.dev`: la dirección de prueba de Resend no rebota ni daña
//   la reputación del dominio (resend-docs: knowledge-base/what-email-addresses-to-use-for-testing).
// - Los tests que leen Mailpit o ejecutan scripts del backend local (`points:adjust`,
//   `codes:create`) se omiten: ese recorrido se revisa a mano (docs/fases/fase11.md §5.6).
// - Acceso: la IP de las pruebas tiene un Bypass en Cloudflare Access y salta el rate limiting
//   (reglas temporales). No se envía el service token: `extraHTTPHeaders` lo mandaría también a
//   Stripe y a R2.
import { test } from "@playwright/test";

const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/;

export const REMOTE = !!process.env.E2E_BASE_URL && !LOCAL.test(process.env.E2E_BASE_URL);

const RUN = Date.now().toString(36);

/** Email de prueba: `…@example.com` en local (Mailpit), `delivered+…@resend.dev` en remoto. */
export function testEmail(tag: string): string {
  const label = `${tag}-${RUN}-${Math.random().toString(36).slice(2, 6)}`;
  return REMOTE ? `delivered+${label}@resend.dev` : `${label}@example.com`;
}

/** Omite el test (o el describe) en remoto. */
export function skipIfRemote(reason = "necesita Mailpit o la BD local del backend"): void {
  test.skip(REMOTE, reason);
}
