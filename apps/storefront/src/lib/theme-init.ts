// Tema claro/oscuro (I-Marca). Sin elección guardada, la web sigue al sistema con CSS puro
// (prefers-color-scheme, global.css). Si la persona pulsa el selector (SiteClient.astro), se
// guarda "light" | "dark" en localStorage (preferencia visual, no un token) y este script la
// aplica con <html data-theme> ANTES de pintar, para evitar el destello del tema contrario.
// Va inline en <head>, idéntico en todas las páginas → un único hash para la CSP (ThemeInit.astro).
// También marca <html data-js> antes de pintar (Fase D, 3.3): el CSS muestra lo que solo sirve
// con JS (botones − / + de cantidad) sin que la página se mueva al cargar SiteClient (CLS 0).
// Fix de la cabecera (antes de la fase 11): en las páginas estáticas, los iconos de cuenta y de
// la lista de deseos salían vacíos hasta que llegaba la island HeaderState y luego cambiaban
// (parpadeo). CartClient guarda una PISTA del último estado conocido en localStorage
// (HEADER_HINT_KEY: "a" = con sesión, "aw" = con sesión y algo guardado; sin clave = sin sesión;
// ningún dato personal ni token) y este script la aplica antes de pintar. La island la corrige
// siempre (p. ej. sesión caducada). Mencionado en /cookies/ (LSSI art. 22.2: técnica, exenta de
// consentimiento pero informada).
export const THEME_KEY = "tema";
export const HEADER_HINT_KEY = "cabecera";
export const THEME_INIT = `var d=document.documentElement;d.dataset.js="";try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")d.dataset.theme=t;var h=localStorage.getItem("${HEADER_HINT_KEY}");if(h){d.dataset.auth="";if(h=="aw")d.dataset.wishAny=""}}catch(e){}`;
