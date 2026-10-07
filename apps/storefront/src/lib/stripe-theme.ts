// Apariencia del Payment Element de Stripe con la marca (I-Marca). Stripe no acepta oklch ni
// var(--x) en sus colores (solo #hex/rgb): son los hex de los tokens de global.css (comentarios),
// y stripe-theme.test.ts comprueba que siguen iguales. Fuente: docs.stripe.com/elements/appearance-api.
const base = { fontFamily: '"Nunito Sans", sans-serif', borderRadius: "0px", fontSizeBase: "16px" };

export const STRIPE_THEME = {
  light: {
    theme: "stripe",
    variables: {
      ...base,
      colorPrimary: "#16708F",
      colorBackground: "#FFFFFF",
      colorText: "#14303C",
      colorDanger: "#C2271F",
    },
    rules: { ".Input": { border: "2px solid #14303C" }, ".Tab": { border: "2px solid #14303C" } },
  },
  dark: {
    theme: "night",
    variables: {
      ...base,
      colorPrimary: "#62C0E4",
      colorBackground: "#34464F",
      colorText: "#F3F7F8",
      colorDanger: "#FF7A70",
    },
    rules: { ".Input": { border: "2px solid #05090B" }, ".Tab": { border: "2px solid #05090B" } },
  },
} as const;
