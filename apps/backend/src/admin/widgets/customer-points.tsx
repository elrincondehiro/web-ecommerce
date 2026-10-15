import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { useCallback, useEffect, useState, type FormEvent } from "react";

/**
 * Puntos del cliente en el Admin (Fase L-2): saldo, pendiente (pedidos aún sin consolidar),
 * movimientos y ajuste manual con nota (para corregir casos y, más adelante, la tienda física).
 * Zona `customer.details.after` (context7 /medusajs/medusa, admin widgets: DetailWidgetProps).
 * Rutas: GET/POST /admin/customers/:id/points (sesión del Admin con `credentials: "include"`).
 * Sin @medusajs/ui (no es dependencia directa del backend): HTML + clases del dashboard.
 */
type Summary = {
  balance: number;
  pending: number;
  count: number;
  transactions: {
    id: string;
    type: "credit" | "debit";
    amount: number;
    reference: string;
    order_id: string | null;
    note: string | null;
    created_at: string;
  }[];
};

const LABELS: Record<string, string> = {
  order: "Abono del pedido",
  order_redeem: "Canje en pedido",
  order_canceled: "Devolución por cancelación",
  return: "Devolución de productos",
  adjustment: "Ajuste manual",
  account_deleted: "Baja de la cuenta",
};
const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const date = new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" });

const CustomerPointsWidget = ({ data }: { data: { id: string } }) => {
  const url = `/admin/customers/${data.id}/points`;
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch(url, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setSummary)
      .catch(() => setError("No se han podido cargar los puntos."));
  }, [url]);
  useEffect(load, [load]);

  const adjust = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: form.get("type"),
        amount: Number(String(form.get("amount")).replace(",", ".")),
        note: String(form.get("note") ?? ""),
      }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).message ?? "Error");
        (e.target as HTMLFormElement).reset();
        load();
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  };

  const input = "rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1 text-sm";
  return (
    <div className="shadow-elevation-card-rest bg-ui-bg-base divide-y rounded-lg">
      <div className="flex items-center justify-between px-6 py-4">
        <h2 className="font-sans text-base font-medium">Puntos (web)</h2>
        {summary && (
          <p className="text-sm">
            <strong>{eur.format(summary.balance)}</strong>
            <span className="text-ui-fg-subtle"> · pendiente {eur.format(summary.pending)}</span>
          </p>
        )}
      </div>
      {error && <p className="text-ui-fg-error px-6 py-3 text-sm">{error}</p>}
      <ul className="divide-y text-sm">
        {(summary?.transactions ?? []).map((t) => (
          <li key={t.id} className="flex justify-between gap-4 px-6 py-2">
            <span>
              {LABELS[t.reference] ?? t.reference}
              {t.note && <span className="text-ui-fg-subtle"> · {t.note}</span>}
              <span className="text-ui-fg-muted block text-xs">
                {date.format(new Date(t.created_at))}
              </span>
            </span>
            <span className={t.type === "credit" ? "text-ui-fg-interactive" : ""}>
              {t.type === "credit" ? "+" : "−"}
              {eur.format(t.amount)}
            </span>
          </li>
        ))}
        {summary && summary.transactions.length === 0 && (
          <li className="text-ui-fg-subtle px-6 py-3">Sin movimientos.</li>
        )}
      </ul>
      <form onSubmit={adjust} className="flex flex-wrap items-end gap-2 px-6 py-4 text-sm">
        <label className="flex flex-col gap-1">
          Tipo
          <select name="type" className={input} defaultValue="credit">
            <option value="credit">Abonar</option>
            <option value="debit">Retirar</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Importe (€)
          <input
            name="amount"
            required
            inputMode="decimal"
            pattern="[0-9]+([.,][0-9]{1,2})?"
            className={`${input} w-24`}
          />
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1">
          Motivo (obligatorio)
          <input name="note" required minLength={3} maxLength={300} className={input} />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="bg-ui-button-inverted text-ui-fg-on-inverted rounded-md px-3 py-1.5 disabled:opacity-50"
        >
          Ajustar
        </button>
      </form>
    </div>
  );
};

export const config = defineWidgetConfig({ zone: "customer.details.after" });

export default CustomerPointsWidget;
