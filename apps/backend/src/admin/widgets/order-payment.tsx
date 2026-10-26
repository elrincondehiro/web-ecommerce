import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { paymentMethodInfo, type PaymentLike } from "../../lib/payment-method";

/**
 * Forma de pago del pedido (Fase PG), arriba de la columna lateral: qué hay que hacer con él.
 * - Bizum (o ya capturado): cobrado, no hay que capturar.
 * - Tarjeta / PayPal: autorizado → capturar al preparar el envío (Stripe: 7 días).
 * - Transferencia: capturar = marcar como pagado cuando llegue el dinero.
 * Zona `order.details.side.before` (context7 /medusajs/medusa, admin widgets). Lee
 * `payment_collections.payments` del pedido que ya carga el Admin; sin red.
 */
type OrderData = {
  payment_collections?: ({ payments?: PaymentLike[] | null } | null)[] | null;
};

const OrderPaymentWidget = ({ data }: { data: OrderData }) => {
  const payments = (data.payment_collections ?? [])
    .flatMap((c) => c?.payments ?? [])
    .filter(Boolean);
  const info = paymentMethodInfo(payments[payments.length - 1] ?? null);
  if (!info) return null;
  const [tone, text] = info.captured
    ? ["text-ui-fg-interactive", "Cobrado. No hay que capturar."]
    : info.transfer
      ? [
          "text-ui-fg-error",
          "Pendiente de recibir la transferencia. Cuando llegue, captura el pago para marcarlo como pagado.",
        ]
      : ["text-ui-fg-error", "Autorizado: captura el pago al preparar el envío (plazo de 7 días)."];
  return (
    <div className="shadow-elevation-card-rest bg-ui-bg-base rounded-lg px-6 py-4">
      <h2 className="font-sans text-base font-medium">Forma de pago: {info.label}</h2>
      <p className={`mt-1 text-sm ${tone}`}>{text}</p>
    </div>
  );
};

export const config = defineWidgetConfig({ zone: "order.details.side.before" });

export default OrderPaymentWidget;
