import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { CustomerPets } from "../components/pets";

/**
 * Mascotas del cliente en la ficha del pedido (Fase M), solo lectura y sin las fallecidas; para
 * editarlas, la ficha del cliente. Zona `order.details.side.after` (context7 /medusajs/medusa,
 * admin widgets: `DetailWidgetProps<AdminOrder>`). Pedido de invitado: su ficha no tiene mascotas («Sin mascotas»).
 */
const OrderPetsWidget = ({ data }: { data: { customer_id?: string | null } }) => {
  if (!data.customer_id) return null;
  return (
    <CustomerPets customerId={data.customer_id} editable={false} title="Mascotas del cliente" />
  );
};

export const config = defineWidgetConfig({ zone: "order.details.side.after" });

export default OrderPetsWidget;
