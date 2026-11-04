/**
 * Enlace y cabeceras de baja de los emails comerciales (Fase MK-A). Fuente: MCP resend-docs
 * (add-unsubscribe-to-transactional-emails): `List-Unsubscribe` con URL https y
 * `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058); la misma URL acepta un POST
 * (baja de un clic del cliente de correo) y un GET (página de baja con botón).
 */
export const UNSUBSCRIBE_PATH = "/baja/";

export function unsubscribeUrl(storefrontUrl: string, token: string): string {
  return `${storefrontUrl.replace(/\/+$/, "")}${UNSUBSCRIBE_PATH}?t=${encodeURIComponent(token)}`;
}

export function unsubscribeHeaders(url: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
