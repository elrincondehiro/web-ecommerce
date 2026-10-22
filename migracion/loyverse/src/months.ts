/** Meses (UTC) para descargar los tickets por tramos: reanudable y sin páginas gigantes. */

export interface Month {
  key: string; // AAAA-MM
  from: string; // ISO, inclusive
  to: string; // ISO, exclusivo (Loyverse: `created_at_max` es inclusivo → se resta 1 ms)
}

export function parseMonth(raw: string): { y: number; m: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(raw.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  return m >= 1 && m <= 12 && y >= 2000 && y <= 2100 ? { y, m } : null;
}

export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Meses desde `start` (AAAA-MM) hasta el mes de `now`, ambos incluidos. */
export function monthsBetween(start: string, now: Date): Month[] {
  const p = parseMonth(start);
  if (!p) throw new Error(`Mes no válido: ${start} (formato AAAA-MM)`);
  const out: Month[] = [];
  let y = p.y;
  let m = p.m;
  const endKey = monthKey(now);
  for (;;) {
    const from = new Date(Date.UTC(y, m - 1, 1));
    const next = new Date(Date.UTC(y, m, 1));
    const key = monthKey(from);
    out.push({
      key,
      from: from.toISOString(),
      to: new Date(next.getTime() - 1).toISOString(),
    });
    if (key >= endKey) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** ¿El mes ya terminó (sus tickets no cambiarán, salvo devoluciones o cancelaciones tardías)? */
export function isClosed(month: Month, now: Date): boolean {
  return new Date(month.to).getTime() < now.getTime();
}
