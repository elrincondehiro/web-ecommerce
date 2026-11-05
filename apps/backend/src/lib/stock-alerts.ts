/**
 * Avisos de stock (Fase MK-B, docs/fases/faseMK-marketing.md §2): reglas PURAS (sin BD) para
 * poder probarlas. Las usan las rutas, el job de detección, el email, el widget y el script.
 */

/** Avisos activos como mucho por cliente. */
export const STOCK_ALERT_MAX_PER_CUSTOMER = 50;
/** Días que espera un aviso sin cumplirse (`STOCK_ALERT_TTL_DAYS`, 30–730; por defecto 180). */
export const STOCK_ALERT_TTL_DEFAULT_DAYS = 180;
export const STOCK_ALERT_DEFAULT_CRON = "*/5 * * * *";
export const STOCK_ALERT_EXPIRE_DEFAULT_CRON = "30 4 * * *";
/** Evento al cumplirse uno o varios avisos de un cliente (lo escucha el email). */
export const STOCK_ALERTS_FULFILLED = "stock_alert.fulfilled";

export function stockAlertTtlDays(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 30 && n <= 730 ? n : STOCK_ALERT_TTL_DEFAULT_DAYS;
}

export type AlertRow = {
  id: string;
  customer_id: string;
  product_id: string;
  variant_id: string;
};

/** Una variante que ha vuelto: unidades vendibles y cuántos clientes la esperan. */
export type Restock = { variant_id: string; available: number; waiting: number };

/**
 * «Puede agotarse pronto»: si lo que hay a la venta no llega para todos los que lo esperaban
 * (decisión del usuario). Con stock ilimitado (no gestiona inventario o admite pedidos sin stock)
 * nunca. Granel: `available` son los pasos vendibles (cada uno tiene el mínimo), como un pedido.
 */
export function mayRunOut(r: Restock): boolean {
  return Number.isFinite(r.available) && r.available <= r.waiting;
}

/**
 * Avisos que se cumplen: los de las variantes con stock (`available > 0`). Devuelve también, por
 * variante, cuántos esperaban (para «puede agotarse pronto»).
 */
export function dueAlerts(
  alerts: AlertRow[],
  available: Map<string, number>,
): { due: AlertRow[]; restocks: Map<string, Restock> } {
  const due = alerts.filter((a) => (available.get(a.variant_id) ?? 0) > 0);
  const restocks = new Map<string, Restock>();
  for (const a of due) {
    const r = restocks.get(a.variant_id) ?? {
      variant_id: a.variant_id,
      available: available.get(a.variant_id) ?? 0,
      waiting: 0,
    };
    r.waiting += 1;
    restocks.set(a.variant_id, r);
  }
  return { due, restocks };
}

/** Agrupa por cliente: un email por cliente con todo lo que ha vuelto. */
export function groupByCustomer(alerts: AlertRow[]): Map<string, AlertRow[]> {
  const byCustomer = new Map<string, AlertRow[]>();
  for (const a of alerts) {
    const list = byCustomer.get(a.customer_id) ?? [];
    list.push(a);
    byCustomer.set(a.customer_id, list);
  }
  return byCustomer;
}

export type WaitingRow = {
  product_id: string;
  variant_id: string;
  product_title: string;
  variant_title: string | null;
  sku: string | null;
  waiting: number;
  oldest: string;
};

/** Resumen de espera por variante (Admin y script): de más esperada a menos. */
export function waitingSummary(
  alerts: (AlertRow & { created_at: Date | string })[],
  names: Map<string, { product_title: string; variant_title: string | null; sku: string | null }>,
): WaitingRow[] {
  const rows = new Map<string, WaitingRow>();
  for (const a of alerts) {
    const created = new Date(a.created_at).toISOString();
    const row = rows.get(a.variant_id);
    if (row) {
      row.waiting += 1;
      if (created < row.oldest) row.oldest = created;
      continue;
    }
    const n = names.get(a.variant_id);
    rows.set(a.variant_id, {
      product_id: a.product_id,
      variant_id: a.variant_id,
      product_title: n?.product_title ?? a.product_id,
      variant_title: n?.variant_title ?? null,
      sku: n?.sku ?? null,
      waiting: 1,
      oldest: created,
    });
  }
  return [...rows.values()].sort(
    (a, b) =>
      b.waiting - a.waiting ||
      a.product_title.localeCompare(b.product_title, "es") ||
      (a.variant_title ?? "").localeCompare(b.variant_title ?? "", "es"),
  );
}

/** Título de la variante para enseñar («Única» y el título igual al producto no dicen nada). */
export function variantLabel(productTitle: string, variantTitle: string | null | undefined) {
  return variantTitle && variantTitle !== "Única" && variantTitle !== productTitle
    ? variantTitle
    : null;
}

/** CSV del resumen (script `stock-alerts:list`), separado por `;` como las hojas del catálogo. */
export function waitingCsv(rows: WaitingRow[]): string {
  const cell = (v: string | number | null) => {
    const s = v === null ? "" : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ["esperando", "producto", "variante", "sku", "desde", "product_id", "variant_id"];
  return [
    head.join(";"),
    ...rows.map((r) =>
      [
        r.waiting,
        r.product_title,
        r.variant_title,
        r.sku,
        r.oldest.slice(0, 10),
        r.product_id,
        r.variant_id,
      ]
        .map(cell)
        .join(";"),
    ),
  ].join("\n");
}
