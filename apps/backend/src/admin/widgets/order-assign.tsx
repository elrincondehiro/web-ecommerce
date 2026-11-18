import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { useState, type FormEvent } from "react";

/**
 * Pasar un pedido de INVITADO a una cuenta (fase 13 punto 7), en la columna lateral del pedido.
 * Lo mismo que `pnpm --filter backend orders:assign` (Fase G-3): sin email de aceptación, con el
 * motivo en la nota interna del historial; el pedido pasa al email de la cuenta. Para deshacerlo:
 * «Transferir a invitado» del Admin. Solo se ve si el pedido es de un cliente sin cuenta y no
 * está cancelado (el backend lo vuelve a comprobar).
 * Zona `order.details.side.after` (context7 /medusajs/medusa, admin widgets). Ruta
 * POST /admin/orders/:id/assign (sesión del Admin con `credentials: "include"`). Sin
 * @medusajs/ui (no es dependencia directa del backend): HTML + clases del dashboard.
 */
type OrderData = {
  id: string;
  status?: string | null;
  customer?: { has_account?: boolean | null } | null;
};

const OrderAssignWidget = ({ data }: { data: OrderData }) => {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  if (data.status === "canceled" || data.customer?.has_account) return null;

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    fetch(`/admin/orders/${data.id}/assign`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        account: String(form.get("account") ?? ""),
        note: String(form.get("note") ?? ""),
      }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).message ?? "Error");
        setDone(true);
        // El Admin no recarga solo el pedido: así se ven el cliente y el historial nuevos.
        window.location.reload();
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  };

  const input = "rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1 text-sm";
  return (
    <div className="shadow-elevation-card-rest bg-ui-bg-base rounded-lg px-6 py-4">
      <h2 className="font-sans text-base font-medium">Pasar a una cuenta</h2>
      <p className="text-ui-fg-subtle mt-1 text-sm">
        Pedido sin cuenta. Si es de un cliente con cuenta (lo has comprobado), pásalo a ella: lo
        verá en «Mis pedidos» y pasará al email de la cuenta. Sin email de aceptación.
      </p>
      {done ? (
        <p className="text-ui-fg-interactive mt-2 text-sm">Pedido pasado a la cuenta.</p>
      ) : (
        <form onSubmit={submit} className="mt-3 flex flex-col gap-2 text-sm">
          <label className="flex flex-col gap-1">
            Email de la cuenta (o id cus_…)
            <input name="account" required minLength={3} maxLength={254} className={input} />
          </label>
          <label className="flex flex-col gap-1">
            Motivo (obligatorio; queda en el historial)
            <input name="note" required minLength={3} maxLength={300} className={input} />
          </label>
          {error && <p className="text-ui-fg-error">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="bg-ui-button-inverted text-ui-fg-on-inverted self-start rounded-md px-3 py-1.5 disabled:opacity-50"
          >
            Pasar a la cuenta
          </button>
        </form>
      )}
    </div>
  );
};

export const config = defineWidgetConfig({ zone: "order.details.side.after" });

export default OrderAssignWidget;
