/**
 * Gráficas SVG mínimas para el informe (sin dependencias ni JS): barras, líneas y mapa de calor.
 * Los valores se ven al pasar el ratón (`<title>`). Colores en variables CSS del informe.
 */

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const nf0 = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const eur = (n: number) => `${nf0.format(Math.round(n))} €`;
export const eur2 = (n: number) => `${nf2.format(n)} €`;
export const num = (n: number) => nf0.format(n);
export const pct = (n: number | null) =>
  n === null ? "—" : `${n > 0 ? "+" : ""}${nf2.format(n).replace(/,00$/, "")} %`;

/** Escala «bonita» para el eje Y (0, máximo redondeado y 4 marcas). */
function niceMax(max: number): { max: number; ticks: number[] } {
  if (max <= 0) return { max: 1, ticks: [0, 1] };
  const pow = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 2.5, 5, 10].map((m) => (m * pow) / 4).find((s) => s * 4 >= max) ?? pow;
  return { max: step * 4, ticks: [0, 1, 2, 3, 4].map((i) => i * step) };
}

const short = (n: number) =>
  n >= 1_000_000
    ? `${nf0.format(n / 1_000_000)} M`
    : n >= 1000
      ? `${nf0.format(n / 1000)} k`
      : nf0.format(n);

export interface Series {
  name: string;
  values: (number | null)[];
  color: string;
  dashed?: boolean;
}

const W = 900;
const H = 300;
const PAD = { l: 56, r: 12, t: 12, b: 44 };

function axes(labels: string[], max: number, ticks: number[], every: number) {
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const y = (v: number) => PAD.t + ih - (v / max) * ih;
  const step = iw / Math.max(1, labels.length);
  let out = "";
  for (const t of ticks) {
    out += `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(t)}" y2="${y(t)}" class="grid"/>`;
    out += `<text x="${PAD.l - 6}" y="${y(t) + 4}" text-anchor="end" class="ax">${short(t)}</text>`;
  }
  labels.forEach((l, i) => {
    if (i % every !== 0) return;
    const x = PAD.l + step * i + step / 2;
    out += `<text x="${x}" y="${H - PAD.b + 16}" text-anchor="middle" class="ax">${esc(l)}</text>`;
  });
  return { out, y, step, iw, ih };
}

/** Barras agrupadas (una serie o varias, p. ej. años). */
export function barChart(
  labels: string[],
  series: Series[],
  opts: { every?: number; unit?: (n: number) => string } = {},
) {
  const fmt = opts.unit ?? eur;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const { max, ticks } = niceMax(Math.max(0, ...all));
  const { out, y, step } = axes(labels, max, ticks, opts.every ?? 1);
  const bw = (step * 0.8) / series.length;
  let bars = "";
  series.forEach((s, si) => {
    s.values.forEach((v, i) => {
      if (v === null || v <= 0) return;
      const x = PAD.l + step * i + step * 0.1 + bw * si;
      bars += `<rect x="${x.toFixed(1)}" y="${y(v).toFixed(1)}" width="${Math.max(1, bw - 1).toFixed(1)}" height="${(y(0) - y(v)).toFixed(1)}" fill="${s.color}"><title>${esc(`${labels[i]} · ${s.name}: ${fmt(v)}`)}</title></rect>`;
    });
  });
  return wrap(out + bars, series);
}

/** Líneas (p. ej. ventas mensuales + media móvil). */
export function lineChart(
  labels: string[],
  series: Series[],
  opts: { every?: number; unit?: (n: number) => string; zero?: boolean } = {},
) {
  const fmt = opts.unit ?? eur;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const min = Math.min(0, ...all);
  const { max, ticks } = niceMax(Math.max(0, ...all) - min);
  const { out, step } = axes(
    labels,
    max,
    ticks.map((t) => t),
    opts.every ?? 1,
  );
  const ih = H - PAD.t - PAD.b;
  const y = (v: number) => PAD.t + ih - ((v - min) / max) * ih;
  let lines = "";
  for (const s of series) {
    let d = "";
    let dots = "";
    s.values.forEach((v, i) => {
      if (v === null) return;
      const x = PAD.l + step * i + step / 2;
      d += `${d ? "L" : "M"}${x.toFixed(1)},${y(v).toFixed(1)}`;
      dots += `<circle cx="${x.toFixed(1)}" cy="${y(v).toFixed(1)}" r="6" fill="transparent"><title>${esc(`${labels[i]} · ${s.name}: ${fmt(v)}`)}</title></circle>`;
    });
    lines += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2"${s.dashed ? ' stroke-dasharray="6 4"' : ""}/>${dots}`;
  }
  const zeroLine =
    min < 0 ? `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(0)}" y2="${y(0)}" class="zero"/>` : "";
  return wrap(out + zeroLine + lines, series);
}

/** Barras de variación (positivas verdes, negativas rojas), p. ej. mes vs año anterior. */
export function changeChart(labels: string[], values: (number | null)[], every = 1) {
  const abs = Math.max(10, ...values.map((v) => Math.abs(v ?? 0)));
  const { max } = niceMax(abs);
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const y = (v: number) => PAD.t + ih / 2 - (v / max) * (ih / 2);
  const step = iw / Math.max(1, labels.length);
  let out = "";
  for (const t of [-max, -max / 2, 0, max / 2, max]) {
    out += `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(t)}" y2="${y(t)}" class="${t === 0 ? "zero" : "grid"}"/>`;
    out += `<text x="${PAD.l - 6}" y="${y(t) + 4}" text-anchor="end" class="ax">${t > 0 ? "+" : ""}${nf0.format(t)} %</text>`;
  }
  values.forEach((v, i) => {
    const x = PAD.l + step * i + step * 0.15;
    if (i % every === 0) {
      out += `<text x="${x + step * 0.35}" y="${H - PAD.b + 16}" text-anchor="middle" class="ax">${esc(labels[i] ?? "")}</text>`;
    }
    if (v === null) return;
    const top = Math.min(y(v), y(0));
    out += `<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${(step * 0.7).toFixed(1)}" height="${Math.abs(y(v) - y(0)).toFixed(1)}" fill="var(${v >= 0 ? "--up" : "--down"})"><title>${esc(`${labels[i]}: ${pct(v)}`)}</title></rect>`;
  });
  return wrap(out, []);
}

/** Mapa de calor día de la semana × hora (solo las horas con ventas). */
export function heatmap(values: number[][], rowLabels: string[], fmt: (n: number) => string = eur) {
  const hours = [...Array(24).keys()].filter((h) => values.some((row) => (row[h] ?? 0) > 0));
  if (!hours.length) return "<p>Sin datos.</p>";
  const max = Math.max(...values.flat());
  const cw = 34;
  const ch = 26;
  const left = 40;
  const top = 20;
  const width = left + cw * hours.length + 4;
  const height = top + ch * rowLabels.length + 4;
  let out = "";
  hours.forEach((h, i) => {
    out += `<text x="${left + cw * i + cw / 2}" y="14" text-anchor="middle" class="ax">${h}h</text>`;
  });
  rowLabels.forEach((label, r) => {
    out += `<text x="${left - 6}" y="${top + ch * r + ch / 2 + 4}" text-anchor="end" class="ax">${label}</text>`;
    hours.forEach((h, i) => {
      const v = values[r]?.[h] ?? 0;
      const a = max ? v / max : 0;
      out += `<rect x="${left + cw * i}" y="${top + ch * r}" width="${cw - 2}" height="${ch - 2}" rx="3" fill="var(--accent)" fill-opacity="${(0.06 + a * 0.94).toFixed(2)}"><title>${esc(`${label} ${h}:00–${h + 1}:00 · ${fmt(v)}`)}</title></rect>`;
    });
  });
  return `<svg viewBox="0 0 ${width} ${height}" class="chart heat" role="img">${out}</svg>`;
}

function wrap(inner: string, series: Series[]) {
  const legend =
    series.length > 1
      ? `<div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join("")}</div>`
      : "";
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img">${inner}</svg>${legend}`;
}

/** Paleta para años y series (suficiente contraste en claro y oscuro). */
export const PALETTE = [
  "#64748b",
  "#0ea5e9",
  "#22c55e",
  "#f59e0b",
  "#a855f7",
  "#ef4444",
  "#14b8a6",
  "#ec4899",
];
