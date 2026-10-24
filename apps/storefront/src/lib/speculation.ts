// Speculation Rules (Fase R-3, P7 de la auditoría de rendimiento §4.6): el navegador descarga por
// adelantado el HTML de una ficha, una categoría o un listado cuando la persona va a abrirlo
// (`moderate`: al tocar en móvil, al dejar el ratón ~200 ms encima en escritorio). Medido: toque →
// `<h1>` de la ficha 2680 → 2187 ms en móvil. Solo `prefetch` (no `prerender`): no ejecuta la
// página ni sus server islands, así que no añade carga a Medusa por lo que no se llega a abrir.
// Es JSON, no JS (0 KB de JS); va inline en el <head>, idéntico en todas las páginas → un único
// hash en la CSP (SpeculationRules.astro). Chromium; Safari y Firefox lo ignoran sin romper nada.
// Solo páginas estáticas públicas: nunca carrito, checkout, cuenta, búsqueda ni actions (no hay
// enlaces a ellas con esos patrones, pero el `not` lo deja explícito).
// Fuente: MDN (Speculation Rules API: `where`, `href_matches`, `eagerness`), astro-docs (fase 3
// §7.1: prefetch de Astro y `clientPrerender` descartados por el JS que inyectan).
export const SPECULATION_RULES = JSON.stringify({
  prefetch: [
    {
      where: {
        and: [
          { href_matches: ["/producto/*", "/categoria/*", "/productos/*", "/ofertas/*"] },
          { not: { href_matches: "/*\\?*_action=*" } },
        ],
      },
      eagerness: "moderate",
    },
  ],
});
