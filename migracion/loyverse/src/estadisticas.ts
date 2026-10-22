/**
 * Estadísticas de ventas para el informe HTML (lógica pura, sin I/O; probada en
 * estadisticas.test.ts). Todo en hora de Madrid. Importes con IVA (`total_money` de Loyverse),
 * devoluciones restadas y tickets cancelados fuera. Sin costes ni márgenes: el coste de Loyverse
 * no es fiable (hay artículos sin coste).
 */
import { TIME_ZONE, receiptSign, type SaleReceipt } from "./analisis.ts";

const round2 = (n: number) => Math.round(n * 100) / 100;

const parts = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
  weekday: "short",
});
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Fecha local de un ticket: día, mes, año, hora y día de la semana (0 = lunes). */
export function localParts(iso: string) {
  const p = Object.fromEntries(parts.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  const day = `${p.year}-${p.month}-${p.day}`;
  return {
    day,
    month: day.slice(0, 7),
    year: Number(p.year),
    monthOfYear: Number(p.month),
    dayOfYear: day.slice(5),
    hour: Number(p.hour),
    weekday: WEEKDAYS.indexOf(String(p.weekday)),
  };
}

export interface ProductRef {
  categoria: string;
  articulo: string;
}

export interface Totals {
  money: number;
  tickets: number;
  refunds: number;
  refundMoney: number;
  units: number;
  discount: number;
}
const emptyTotals = (): Totals => ({
  money: 0,
  tickets: 0,
  refunds: 0,
  refundMoney: 0,
  units: 0,
  discount: 0,
});

export interface Stats {
  first: string;
  last: string;
  /** Día del año del último ticket (MM-DD): corte de «mismo periodo». */
  cutoff: string;
  years: number[];
  byYear: Map<number, Totals>;
  /** Mismo periodo (1 ene → `cutoff`) de cada año. */
  byYearToDate: Map<number, Totals>;
  byMonth: Map<string, Totals>;
  /** Días con algún ticket, por mes. */
  daysByMonth: Map<string, number>;
  /** [día de la semana 0-6][hora 0-23] → importe. */
  heat: number[][];
  heatTickets: number[][];
  byCategoryYear: Map<string, Map<number, number>>;
  /** Por producto (artículo): importe y unidades en los últimos 12 meses y los 12 anteriores. */
  products: Map<string, { ref: ProductRef; last12: number; prev12: number; units12: number }>;
  payments: Map<string, Map<number, number>>;
}

/**
 * `products`: variant_id → categoría y artículo del catálogo. Las líneas de variantes que ya no
 * están en el catálogo se agrupan por el nombre del ticket («(fuera del catálogo)»).
 */
export function computeStats(
  receipts: SaleReceipt[],
  products: Map<string, ProductRef>,
  now: Date,
): Stats {
  const byYear = new Map<number, Totals>();
  const byYearToDate = new Map<number, Totals>();
  const byMonth = new Map<string, Totals>();
  const days = new Map<string, Set<string>>();
  const heat = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  const heatTickets = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  const byCategoryYear = new Map<string, Map<number, number>>();
  const prods: Stats["products"] = new Map();
  const payments = new Map<string, Map<number, number>>();

  const valid = receipts
    .filter((r) => receiptSign(r) !== 0)
    .map((r) => ({ r, date: r.receipt_date || r.created_at }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const first = valid[0]?.date ?? now.toISOString();
  const last = valid.at(-1)?.date ?? now.toISOString();
  const cutoff = localParts(last).dayOfYear;
  const lastTime = new Date(last).getTime();
  const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

  const add = <K>(map: Map<K, Totals>, key: K) => {
    let t = map.get(key);
    if (!t) map.set(key, (t = emptyTotals()));
    return t;
  };

  for (const { r, date } of valid) {
    const sign = receiptSign(r);
    const p = localParts(date);
    const money = sign * (Number(r.total_money) || 0);
    const units = r.line_items.reduce((acc, l) => acc + (Number(l.quantity) || 0), 0) * sign;
    const targets = [add(byYear, p.year), add(byMonth, p.month)];
    if (p.dayOfYear <= cutoff) targets.push(add(byYearToDate, p.year));
    for (const t of targets) {
      t.money += money;
      t.units += units;
      t.discount += sign * (Number(r.total_discount) || 0);
      if (sign > 0) t.tickets++;
      else {
        t.refunds++;
        t.refundMoney += -money;
      }
    }
    if (sign > 0) {
      const set = days.get(p.month) ?? new Set<string>();
      set.add(p.day);
      days.set(p.month, set);
      heat[p.weekday]![p.hour]! += money;
      heatTickets[p.weekday]![p.hour]! += 1;
    }
    const age = lastTime - new Date(date).getTime();
    for (const l of r.line_items) {
      const ref = (l.variant_id && products.get(l.variant_id)) || {
        categoria: "(fuera del catálogo)",
        articulo: l.item_name ?? "?",
      };
      const lineMoney = sign * (Number(l.total_money) || 0);
      const cat = byCategoryYear.get(ref.categoria) ?? new Map<number, number>();
      cat.set(p.year, (cat.get(p.year) ?? 0) + lineMoney);
      byCategoryYear.set(ref.categoria, cat);
      const key = `${ref.categoria}|${ref.articulo}`;
      let pr = prods.get(key);
      if (!pr) prods.set(key, (pr = { ref, last12: 0, prev12: 0, units12: 0 }));
      if (age < YEAR_MS) {
        pr.last12 += lineMoney;
        pr.units12 += sign * (Number(l.quantity) || 0);
      } else if (age < 2 * YEAR_MS) pr.prev12 += lineMoney;
    }
    for (const pay of r.payments ?? []) {
      const name = normalizePayment(pay.name);
      const m = payments.get(name) ?? new Map<number, number>();
      m.set(p.year, (m.get(p.year) ?? 0) + sign * (Number(pay.money_amount) || 0));
      payments.set(name, m);
    }
  }
  const years = [...byYear.keys()].sort((a, b) => a - b);
  return {
    first,
    last,
    cutoff,
    years,
    byYear,
    byYearToDate,
    byMonth,
    daysByMonth: new Map([...days].map(([k, v]) => [k, v.size])),
    heat,
    heatTickets,
    byCategoryYear,
    products: prods,
    payments,
  };
}

/** «1. Tarjeta» y «Tarjeta» son lo mismo (Loyverse numera los tipos de pago para ordenarlos). */
export function normalizePayment(name: string | null | undefined): string {
  return (name ?? "Otro").replace(/^\s*\d+\.\s*/, "").trim() || "Otro";
}

/** Meses consecutivos entre el primero y el último (con 0 si no hubo ventas). */
export function monthRange(first: string, last: string): string[] {
  const out: string[] = [];
  let [y, m] = first.split("-").map(Number) as [number, number];
  const [ly, lm] = last.split("-").map(Number) as [number, number];
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

/** Media móvil de `n` (null hasta tener `n` valores). */
export function movingAverage(values: number[], n: number): (number | null)[] {
  return values.map((_, i) =>
    i + 1 < n ? null : round2(values.slice(i + 1 - n, i + 1).reduce((a, b) => a + b, 0) / n),
  );
}

/** Variación porcentual (null si no hay base). */
export const pctChange = (now: number, before: number): number | null =>
  before > 0 ? round2(((now - before) / before) * 100) : null;

/**
 * Pareto: productos ordenados por importe y cuántos hacen el 80 % (de los que tienen ventas
 * positivas).
 */
export function pareto(values: number[], share = 0.8) {
  const sorted = values.filter((v) => v > 0).sort((a, b) => b - a);
  const total = sorted.reduce((a, b) => a + b, 0);
  let acc = 0;
  let count = 0;
  for (const v of sorted) {
    acc += v;
    count++;
    if (acc >= total * share) break;
  }
  return { products: sorted.length, top: count, total: round2(total) };
}
