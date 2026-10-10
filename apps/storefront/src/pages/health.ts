// Comprobación de vida del proceso Node del storefront (fase 10): HEALTHCHECK del contenedor,
// Caddy y Uptime Kuma (AGENTS §7.1). Solo dice que el servidor responde; no consulta el backend
// (una caída de Medusa no debe reiniciar el storefront: las páginas estáticas siguen sirviéndose).
// Con `trailingSlash: "always"` la ruta es /health/.
import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = () =>
  new Response("OK", {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
