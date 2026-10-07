// Tema claro/oscuro (I-Marca). Sin elección guardada, la web sigue al sistema con CSS puro
// (prefers-color-scheme, global.css). Si la persona pulsa el selector (SiteClient.astro), se
// guarda "light" | "dark" en localStorage (preferencia visual, no un token) y este script la
// aplica con <html data-theme> ANTES de pintar, para evitar el destello del tema contrario.
// Va inline en <head>, idéntico en todas las páginas → un único hash para la CSP (ThemeInit.astro).
export const THEME_KEY = "tema";
export const THEME_INIT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
