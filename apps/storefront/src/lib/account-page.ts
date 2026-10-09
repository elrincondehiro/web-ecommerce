// Ayudas de las páginas de /cuenta/ (fase 9): leen y borran la cookie flash y fijan la caché.
// Separado de lib/account.ts (puro) porque usa los tipos de Astro.
import type { AstroGlobal } from "astro";
import {
  ACCOUNT_FLASH_COOKIE,
  ACCOUNT_PATH,
  TOKEN_COOKIE,
  decodeAccountFlash,
  loginRedirect,
  type AccountFlash,
} from "./account";
import { retrieveCustomer, type StoreCustomer } from "./medusa";

/** Página por usuario: nunca en caché. Devuelve el aviso de la cookie flash (y la borra). */
export function accountPage(Astro: AstroGlobal): AccountFlash {
  Astro.response.headers.set("Cache-Control", "private, no-store");
  const flash = decodeAccountFlash(Astro.cookies.get(ACCOUNT_FLASH_COOKIE)?.value);
  if (Astro.cookies.has(ACCOUNT_FLASH_COOKIE)) {
    Astro.cookies.delete(ACCOUNT_FLASH_COOKIE, { path: ACCOUNT_PATH });
  }
  return flash;
}

export type SessionResult =
  { ok: true; token: string; customer: StoreCustomer } | { ok: false; redirect: Response };

/**
 * Páginas con sesión: el cliente del token, o la redirección a "Entrar" (con `?next=` a esta
 * página). Si Medusa rechaza el token (caducado, revocado por cambio de secreto), se borra la
 * cookie. Otros errores (backend caído) se lanzan: página de error, no "Entrar".
 */
export async function requireCustomer(Astro: AstroGlobal): Promise<SessionResult> {
  const token = Astro.locals.customerToken;
  const toLogin = () => ({
    ok: false as const,
    redirect: Astro.redirect(loginRedirect(Astro.url.pathname + Astro.url.search), 303),
  });
  if (!token) return toLogin();
  try {
    return { ok: true, token, customer: await retrieveCustomer(token) };
  } catch (err) {
    if ((err as { status?: unknown } | null)?.status !== 401) throw err;
    Astro.cookies.delete(TOKEN_COOKIE, { path: "/" });
    return toLogin();
  }
}
