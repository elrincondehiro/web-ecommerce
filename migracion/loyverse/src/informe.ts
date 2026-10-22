/**
 * Informe de ventas en HTML (un único fichero autocontenido, sin JS ni recursos externos):
 *
 *   pnpm --filter migracion-loyverse informe   →   datos/informe/ventas.html
 *
 * Solo lee lo descargado (catálogo y tickets). Importes con IVA, devoluciones restadas,
 * cancelados fuera, hora de Madrid. Sin márgenes: el coste de Loyverse no es fiable.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SaleReceipt } from "./analisis.ts";
import {
  computeStats,
  localParts,
  monthRange,
  movingAverage,
  pareto,
  pctChange,
  type ProductRef,
  type Stats,
  type Totals,
} from "./estadisticas.ts";
import { DATA, RAW, RECEIPTS, exists, readJson, readJsonl, receiptMonths } from "./files.ts";
import {
  PALETTE,
  barChart,
  changeChart,
  esc,
  eur,
  eur2,
  heatmap,
  lineChart,
  num,
  pct,
} from "./svg.ts";
import type { Category, Item } from "./types.ts";

// eslint-disable-next-line no-console -- script de terminal
const log = (msg: string) => console.log(msg);

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const WEEKDAYS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5)) - 1]} ${m.slice(2, 4)}`;
const dateLabel = (iso: string) =>
  new Intl.DateTimeFormat("es-ES", { dateStyle: "long", timeZone: "Europe/Madrid" }).format(
    new Date(iso),
  );

const table = (head: string[], rows: (string | number)[][], numeric = new Set<number>()) =>
  `<table><thead><tr>${head.map((h, i) => `<th${numeric.has(i) ? ' class="n"' : ""}>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows
    .map(
      (r) =>
        `<tr>${r.map((c, i) => `<td${numeric.has(i) ? ' class="n"' : ""}>${typeof c === "number" ? num(c) : c}</td>`).join("")}</tr>`,
    )
    .join("")}</tbody></table>`;

const range = (n: number) => new Set([...Array(n).keys()].slice(1));
const avg = (t: Totals) => (t.tickets ? t.money / t.tickets : 0);
const upDown = (v: number | null) =>
  v === null ? "—" : `<span class="${v >= 0 ? "up" : "down"}">${pct(v)}</span>`;

export function renderReport(s: Stats, generatedAt: Date): string {
  const months = monthRange(s.first.slice(0, 7), localParts(s.last).month);
  const monthMoney = months.map((m) => s.byMonth.get(m)?.money ?? 0);
  const yearColor = (y: number, i: number) => PALETTE[(i + 8 - (s.years.length % 8)) % 8]!;
  const lastYear = s.years.at(-1)!;
  const cutLabel = `${Number(s.cutoff.slice(3))} ${MONTHS[Number(s.cutoff.slice(0, 2)) - 1]}`;

  // 1. Resumen por año
  const yearRows = s.years.map((y, i) => {
    const t = s.byYear.get(y)!;
    const prev = s.byYear.get(s.years[i - 1] ?? -1);
    const ytd = s.byYearToDate.get(y);
    const ytdPrev = s.byYearToDate.get(y - 1);
    return [
      String(y),
      eur(t.money),
      num(t.tickets),
      eur2(avg(t)),
      (t.tickets ? t.units / t.tickets : 0).toFixed(2).replace(".", ","),
      upDown(prev ? pctChange(t.money, prev.money) : null),
      eur(ytd?.money ?? 0),
      upDown(ytd && ytdPrev ? pctChange(ytd.money, ytdPrev.money) : null),
      `${num(t.refunds)} · ${eur(t.refundMoney)}`,
      eur(t.discount),
    ];
  });
  const total = [...s.byYear.values()].reduce((a, t) => a + t.money, 0);
  const ytdNow = s.byYearToDate.get(lastYear);
  const ytdPrev = s.byYearToDate.get(lastYear - 1);
  const last12 = monthMoney.slice(-12).reduce((a, b) => a + b, 0);
  const prev12 = monthMoney.slice(-24, -12).reduce((a, b) => a + b, 0);

  // 2. Evolución mensual + media móvil
  const every = Math.max(1, Math.ceil(months.length / 18));
  const evolution = lineChart(
    months.map(monthLabel),
    [
      { name: "Ventas del mes", values: monthMoney, color: "var(--accent)" },
      {
        name: "Media móvil 12 meses",
        values: movingAverage(monthMoney, 12),
        color: "var(--muted)",
        dashed: true,
      },
    ],
    { every },
  );

  // 3. Variación vs mismo mes del año anterior
  const yoyLabels = months.slice(12);
  const yoy = yoyLabels.map((m) => {
    const before = `${Number(m.slice(0, 4)) - 1}${m.slice(4)}`;
    return pctChange(s.byMonth.get(m)?.money ?? 0, s.byMonth.get(before)?.money ?? 0);
  });

  // 4. Cada mes por año (estacionalidad) + media diaria
  const perYearSeries = s.years.map((y, i) => ({
    name: String(y),
    values: MONTHS.map((_, m) => {
      const key = `${y}-${String(m + 1).padStart(2, "0")}`;
      return s.byMonth.has(key) ? s.byMonth.get(key)!.money : null;
    }),
    color: yearColor(y, i),
  }));
  const seasonality = barChart(MONTHS, perYearSeries);
  const dailyAvgRows = s.years.map((y) => [
    String(y),
    ...MONTHS.map((_, m) => {
      const key = `${y}-${String(m + 1).padStart(2, "0")}`;
      const days = s.daysByMonth.get(key);
      return days ? eur(s.byMonth.get(key)!.money / days) : "—";
    }),
  ]);

  // 5. Mapa de calor
  const heat = heatmap(s.heat, WEEKDAYS);
  const weekdayRows = WEEKDAYS.map((d, i) => {
    const money = s.heat[i]!.reduce((a, b) => a + b, 0);
    const tickets = s.heatTickets[i]!.reduce((a, b) => a + b, 0);
    return [d, eur(money), num(tickets), tickets ? eur2(money / tickets) : "—"];
  });

  // 6. Categorías
  const cats = [...s.byCategoryYear.entries()]
    .map(([name, byYear]) => ({
      name,
      byYear,
      total: [...byYear.values()].reduce((a, b) => a + b, 0),
    }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);
  const catRows = cats.map((c) => {
    const lastY = c.byYear.get(lastYear) ?? 0;
    const prevY = c.byYear.get(lastYear - 1) ?? 0;
    const yearTotal = s.byYear.get(lastYear)?.money ?? 0;
    return [
      esc(c.name),
      ...s.years.map((y) => eur(c.byYear.get(y) ?? 0)),
      yearTotal ? `${((lastY / yearTotal) * 100).toFixed(1).replace(".", ",")} %` : "—",
      upDown(pctChange(c.byYear.get(lastYear - 1) ?? 0, c.byYear.get(lastYear - 2) ?? 0)),
      eur(prevY),
    ];
  });
  const topCats = cats.slice(0, 8);
  const catChart = barChart(
    s.years.map(String),
    topCats.map((c, i) => ({
      name: c.name,
      values: s.years.map((y) => c.byYear.get(y) ?? 0),
      color: PALETTE[i % PALETTE.length]!,
    })),
  );

  // 7. Productos
  const prods = [...s.products.values()];
  const top = [...prods].sort((a, b) => b.last12 - a.last12).slice(0, 30);
  const p = pareto(prods.map((x) => x.last12));
  const movers = prods.filter((x) => x.last12 + x.prev12 >= 300);
  const up = [...movers].sort((a, b) => b.last12 - b.prev12 - (a.last12 - a.prev12)).slice(0, 15);
  const down = [...movers].sort((a, b) => a.last12 - a.prev12 - (b.last12 - b.prev12)).slice(0, 15);
  const prodRow = (x: (typeof prods)[number]) => [
    esc(x.ref.articulo),
    esc(x.ref.categoria),
    eur(x.last12),
    eur(x.prev12),
    upDown(pctChange(x.last12, x.prev12)),
  ];

  // 8. Formas de pago
  const pays = [...s.payments.entries()]
    .map(([name, byYear]) => ({
      name,
      byYear,
      total: [...byYear.values()].reduce((a, b) => a + b, 0),
    }))
    .sort((a, b) => b.total - a.total);
  const payRows = pays.map((x) => [
    esc(x.name),
    ...s.years.map((y) => {
      const v = x.byYear.get(y) ?? 0;
      const t = s.byYear.get(y)?.money ?? 0;
      return t ? `${eur(v)} <small>(${((v / t) * 100).toFixed(0)} %)</small>` : "—";
    }),
  ]);

  const n = (k: number) => range(k);
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Ventas de la tienda física · ${esc(dateLabel(s.first))} – ${esc(dateLabel(s.last))}</title>
<style>
:root{--bg:#fff;--fg:#1e293b;--muted:#64748b;--line:#e2e8f0;--card:#f8fafc;--accent:#0369a1;--up:#15803d;--down:#b91c1c;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#0f172a;--fg:#e2e8f0;--muted:#94a3b8;--line:#334155;--card:#1e293b;--accent:#38bdf8;--up:#4ade80;--down:#f87171}}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 system-ui,sans-serif;background:var(--bg);color:var(--fg)}
main{max-width:1100px;margin:auto;padding:24px}h1{margin:0 0 4px}h2{margin:40px 0 8px;border-bottom:2px solid var(--line);padding-bottom:4px}
p.note{color:var(--muted);margin:4px 0 12px}nav{display:flex;flex-wrap:wrap;gap:6px 14px;margin:16px 0}nav a{color:var(--accent)}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin:16px 0}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px}.kpi b{display:block;font-size:1.5em}.kpi span{color:var(--muted);font-size:.9em}
.chart{width:100%;height:auto;background:var(--card);border:1px solid var(--line);border-radius:8px}.heat{max-width:900px}
.chart .grid{stroke:var(--line)}.chart .zero{stroke:var(--muted)}.chart .ax{fill:var(--muted);font-size:11px}
.legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:.85em;margin:6px 0}.legend i{display:inline-block;width:12px;height:12px;border-radius:2px;margin-right:4px;vertical-align:-1px}
.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:.9em;margin:8px 0}th,td{border-bottom:1px solid var(--line);padding:4px 8px;text-align:left;white-space:nowrap}
th{background:var(--card);position:sticky;top:0}.n{text-align:right;font-variant-numeric:tabular-nums}.up{color:var(--up)}.down{color:var(--down)}
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(420px,100%),1fr));gap:16px}.cols>div{min-width:0}small{color:var(--muted)}
</style>
</head>
<body><main>
<h1>Ventas de la tienda física</h1>
<p class="note">Del ${esc(dateLabel(s.first))} al ${esc(dateLabel(s.last))} · generado el ${esc(dateLabel(generatedAt.toISOString()))}. Importes con IVA, devoluciones restadas y tickets cancelados fuera. Sin márgenes: el coste en Loyverse no es fiable.</p>
<nav><a href="#resumen">Resumen</a><a href="#evolucion">Evolución</a><a href="#interanual">Interanual</a><a href="#estacionalidad">Estacionalidad</a><a href="#horario">Días y horas</a><a href="#categorias">Categorías</a><a href="#productos">Productos</a><a href="#pagos">Formas de pago</a></nav>

<div class="kpis">
<div class="kpi"><span>Total desde la apertura</span><b>${eur(total)}</b></div>
<div class="kpi"><span>Últimos 12 meses</span><b>${eur(last12)}</b><span>${upDown(pctChange(last12, prev12))} frente a los 12 anteriores</span></div>
<div class="kpi"><span>${lastYear} hasta el ${esc(cutLabel)}</span><b>${eur(ytdNow?.money ?? 0)}</b><span>${upDown(ytdNow && ytdPrev ? pctChange(ytdNow.money, ytdPrev.money) : null)} frente al mismo periodo de ${lastYear - 1}</span></div>
<div class="kpi"><span>Ticket medio ${lastYear}</span><b>${eur2(ytdNow ? avg(ytdNow) : 0)}</b><span>${ytdPrev ? `${eur2(avg(ytdPrev))} en ${lastYear - 1} (mismo periodo)` : ""}</span></div>
</div>

<h2 id="resumen">Resumen por año</h2>
<p class="note">«Mismo periodo» = del 1 de enero al ${esc(cutLabel)} de cada año: compara ${lastYear} (incompleto) con los anteriores sin trampas. ${s.years[0]} empieza con la apertura.</p>
<div class="scroll">${table(["Año", "Ventas", "Tickets", "Ticket medio", "Art./ticket", "vs año ant.", `1 ene–${cutLabel}`, "vs año ant.", "Devoluciones", "Descuentos"], yearRows, n(10))}</div>

<h2 id="evolucion">Evolución mensual</h2>
<p class="note">La media móvil de 12 meses quita la estacionalidad: si sube, la tienda crece.</p>
${evolution}

<h2 id="interanual">Cada mes frente al mismo mes del año anterior</h2>
${changeChart(yoyLabels.map(monthLabel), yoy, every)}

<h2 id="estacionalidad">Estacionalidad</h2>
<p class="note">Ventas de cada mes, por año.</p>
${seasonality}
<p class="note">Venta media por día abierto (días con algún ticket), por mes:</p>
<div class="scroll">${table(["Año", ...MONTHS], dailyAvgRows, n(13))}</div>

<h2 id="horario">Días de la semana y horas</h2>
<p class="note">Ventas acumuladas desde la apertura (más intenso = más ventas). Pasa el ratón por una celda para ver el importe.</p>
${heat}
${table(["Día", "Ventas", "Tickets", "Ticket medio"], weekdayRows, n(4))}

<h2 id="categorias">Categorías</h2>
<p class="note">Categoría actual del artículo en Loyverse (también para ventas antiguas). «(fuera del catálogo)» = artículos que ya no existen en Loyverse.</p>
${catChart}
<div class="scroll">${table(["Categoría", ...s.years.map(String), `% de ${lastYear}`, `${lastYear - 1} vs ${lastYear - 2}`, `${lastYear - 1}`], catRows, n(s.years.length + 4))}</div>

<h2 id="productos">Productos</h2>
<p class="note">Últimos 12 meses frente a los 12 anteriores (hasta el último ticket). Por artículo (todas sus variantes juntas).</p>
<div class="kpis"><div class="kpi"><span>Pareto (últimos 12 meses)</span><b>${num(p.top)} de ${num(p.products)}</b><span>artículos hacen el 80 % de las ventas (${p.products ? ((p.top / p.products) * 100).toFixed(0) : 0} %)</span></div></div>
<h3>Los 30 más vendidos</h3>
<div class="scroll">${table(["Artículo", "Categoría", "12 meses", "12 anteriores", "Variación"], top.map(prodRow), new Set([2, 3, 4]))}</div>
<div class="cols">
<div><h3>Los que más suben</h3><div class="scroll">${table(["Artículo", "Categoría", "12 meses", "12 anteriores", "Variación"], up.map(prodRow), new Set([2, 3, 4]))}</div></div>
<div><h3>Los que más bajan</h3><div class="scroll">${table(["Artículo", "Categoría", "12 meses", "12 anteriores", "Variación"], down.map(prodRow), new Set([2, 3, 4]))}</div></div>
</div>
<p class="note">Suben y bajan: artículos con al menos 300 € entre los dos periodos, ordenados por diferencia en euros.</p>

<h2 id="pagos">Formas de pago</h2>
<div class="scroll">${table(["Forma de pago", ...s.years.map(String)], payRows, n(s.years.length + 1))}</div>
</main></body></html>
`;
}

async function main() {
  if (!exists(join(RAW, "articulos.json")))
    throw new Error("No hay datos: ejecuta antes `descargar`.");
  const items = await readJson<Item[]>(join(RAW, "articulos.json"));
  const categories = new Map(
    (await readJson<Category[]>(join(RAW, "categorias.json"))).map((c) => [c.id, c.name]),
  );
  const products = new Map<string, ProductRef>();
  for (const it of items) {
    const ref = {
      categoria: (it.category_id && categories.get(it.category_id)) || "(sin categoría)",
      articulo: it.item_name,
    };
    for (const v of it.variants) products.set(v.variant_id, ref);
  }
  const receipts: SaleReceipt[] = [];
  for (const f of await receiptMonths()) {
    receipts.push(...(await readJsonl<SaleReceipt>(join(RECEIPTS, f))));
  }
  if (!receipts.length) throw new Error("No hay tickets descargados.");
  const now = new Date();
  const html = renderReport(computeStats(receipts, products, now), now);
  const out = join(DATA, "informe", "ventas.html");
  await mkdir(join(DATA, "informe"), { recursive: true });
  await writeFile(out, html);
  log(
    `Informe: migracion/loyverse/datos/informe/ventas.html (${Math.round(html.length / 1024)} KB)`,
  );
}

if (import.meta.main) {
  main().catch((err: unknown) => {
    log(`Error: ${(err as Error).message}`);
    process.exitCode = 1;
  });
}
