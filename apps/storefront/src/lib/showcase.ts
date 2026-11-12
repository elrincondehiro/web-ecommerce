// Escaparate «Vuestros peques» (Fase MK-D): funciones PURAS para Vitest. La página (/peques/,
// on-demand, noindex) pinta tarjetas que flotan con movimiento aleatorio SOLO con CSS: el
// recorrido, la duración y el retardo de cada tarjeta salen de una semilla (su posición y el día)
// y van en el <head> como CSS con hash (HeadStyle: la CSP no admite style="…"). 0 JS.
// Barajado: las tarjetas se ordenan con una semilla del día (cambia el orden cada día y todos ven
// lo mismo: la página se puede cachear).

export interface ShowcaseCard {
  name: string;
  photo: string;
  /** Vivas: «3 años»; fallecidas: «Hiro · 2009–2023». */
  label: string | null;
}

export interface Showcase {
  alive: ShowcaseCard[];
  gone: ShowcaseCard[];
}

/** Generador pseudoaleatorio determinista (mulberry32): mismo `seed` → misma secuencia. */
export function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Semilla del día (AAAAMMDD en Madrid): el orden cambia cada día, igual para todos. */
export function daySeed(now = new Date()): number {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(now);
  return Number(d.replaceAll("-", ""));
}

/** Copia barajada (Fisher–Yates) con la semilla. */
export function shuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  const rnd = random(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * CSS de las tarjetas flotantes: por cada una (`.peque-<i>`), un recorrido propio (4 puntos de
 * desplazamiento y giro suaves), duración 14–26 s y retardo negativo (cada una empieza en un punto
 * distinto). Las reglas comunes (keyframes base, pausa, prefers-reduced-motion) están en global.css.
 */
export function floatingCss(count: number, seed: number): string {
  const rnd = random(seed ^ 0x9e3779b9);
  const rules: string[] = [];
  for (let i = 0; i < count; i++) {
    const p = () => `${r1((rnd() - 0.5) * 28)}px`;
    const deg = () => `${r1((rnd() - 0.5) * 8)}deg`;
    const dur = r1(14 + rnd() * 12);
    const delay = r1(-rnd() * dur);
    rules.push(
      `@keyframes peque-${i}{0%,100%{transform:translate(0,0) rotate(${deg()})}` +
        `25%{transform:translate(${p()},${p()}) rotate(${deg()})}` +
        `50%{transform:translate(${p()},${p()}) rotate(${deg()})}` +
        `75%{transform:translate(${p()},${p()}) rotate(${deg()})}}` +
        `.peque-${i}{animation:peque-${i} ${dur}s ease-in-out ${delay}s infinite}`,
    );
  }
  return rules.join("\n");
}

/**
 * Fallecidas: «Hiro · 2009–2023» (backend) → nombre y años en líneas separadas, para que todas las
 * tarjetas del arcoíris midan lo mismo (cada línea se recorta con «…» si no cabe).
 */
export function splitGoneLabel(
  label: string | null,
  name: string,
): { name: string; years: string | null } {
  const prefix = `${name} · `;
  if (!label?.startsWith(prefix)) return { name, years: null };
  return { name, years: label.slice(prefix.length) };
}

/** Duración del desfile de las fallecidas (más tarjetas → más lento, a velocidad constante). */
export function rainbowDuration(count: number): number {
  return Math.max(30, count * 8);
}
