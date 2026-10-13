// @ts-check
// Redirecciones 301 permanentes del sitio (Fase E, docs/fases/faseE-urls-correas.md §E-1).
// Las aplica Astro (`redirects` en astro.config.mjs): con @astrojs/node las sirve el servidor
// con un 301 de verdad (308 para métodos distintos de GET), no con <meta refresh>.
// Fuente: astro-docs (configuration-reference#redirects, guides/routing#configured-redirects).
//
// Cuándo añadir una: al cambiar el handle de un producto o de una categoría en Medusa, o al quitar
// una página. Formato: ruta antigua → ruta nueva, SIN «/» final (como las rutas de Astro; con
// trailingSlash: "always" Astro responde en la URL con «/»). Ejemplo:
//   "/producto/correa-roja": "/producto/correa-roja-nylon",
// Las rutas dinámicas valen si los dos lados tienen los MISMOS parámetros.
// ⚠️ Una página que exista con la ruta antigua gana a la redirección (prioridad de rutas de
// Astro): el test `url-rules.test.ts` lo comprueba.

/** @type {Record<string, string>} */
export const REDIRECTS = {
  // Fase E: /categorias/ → /categoria/ (la URL antigua solo existió en desarrollo).
  "/categorias/[handle]/[...page]": "/categoria/[handle]/[...page]",
};

const PATH_RE = /^(?:\/[a-z0-9\-[\].]+)+$/;

/**
 * Errores de formato de un mapa de redirecciones (vacío = válido).
 * @param {Record<string, string>} map
 * @returns {string[]}
 */
export function redirectErrors(map) {
  /** @type {string[]} */
  const errors = [];
  const params = (/** @type {string} */ p) =>
    [...p.matchAll(/\[[^\]]+\]/g)].map((m) => m[0]).sort();
  for (const [from, to] of Object.entries(map)) {
    if (!PATH_RE.test(from)) errors.push(`Origen no válido: «${from}» (ruta sin «/» final).`);
    const external = /^https:\/\//.test(to);
    if (!external && !PATH_RE.test(to)) errors.push(`Destino no válido: «${to}».`);
    if (from === to) errors.push(`«${from}» redirige a sí misma.`);
    if (!external && params(from).join() !== params(to).join()) {
      errors.push(`«${from}» → «${to}»: los dos lados necesitan los mismos parámetros.`);
    }
    if (!external && from !== to && map[to] !== undefined)
      errors.push(`Cadena de redirecciones: «${to}».`);
  }
  return errors;
}

/**
 * Mapa para `redirects` de Astro. Lanza un error si no es válido: el build no sigue.
 * @param {Record<string, string>} map
 */
export function astroRedirects(map = REDIRECTS) {
  const errors = redirectErrors(map);
  if (errors.length) throw new Error(`src/lib/redirects.mjs:\n- ${errors.join("\n- ")}`);
  return map;
}
