/**
 * Colores de marca en hex (los clientes de correo no entienden `oklch`). Son los hex de los
 * comentarios de `apps/storefront/src/styles/global.css` (tema claro, I-Marca).
 */
export const color = {
  background: "#F3E8DC",
  card: "#FFFFFF",
  foreground: "#14303C",
  primary: "#16708F",
  primaryForeground: "#FFFFFF",
  secondary: "#E3F2F8",
  muted: "#EADFD3",
  mutedForeground: "#52606A",
  border: "#DCCFC2",
  accentText: "#B8355A",
} as const;

/** Fuentes de sistema: no se cargan webfonts en los emails (muchos clientes las bloquean). */
export const fontFamily =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export const STORE_NAME = "El Rincón de Hiro";
