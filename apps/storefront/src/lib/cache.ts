// Caché HTTP por ruta (auditoría pre-fase 10, B1). Función pura: la usa src/middleware.ts.
// Rutas por usuario: nunca en una caché compartida (Cloudflare, Caddy), ni las redirecciones.

/** Prefijos de rutas cuya respuesta depende del usuario (cookies). */
export const PRIVATE_PREFIXES = ["/carrito/", "/checkout/", "/pedido/", "/cuenta/", "/_actions/"];

/** ¿La respuesta de esta ruta es por usuario? (`/cuenta` sin barra también). */
export function isPrivatePath(pathname: string): boolean {
  const path = pathname.endsWith("/") ? pathname : `${pathname}/`;
  return PRIVATE_PREFIXES.some((p) => path.startsWith(p));
}
