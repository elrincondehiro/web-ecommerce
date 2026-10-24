import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { CustomerPets } from "../components/pets";

/**
 * Mascotas del cliente en su ficha del Admin (Fase M): ver, añadir, editar, foto y borrar.
 * Zona `customer.details.after` (context7 /medusajs/medusa, admin widgets).
 */
const CustomerPetsWidget = ({ data }: { data: { id: string } }) => (
  <CustomerPets customerId={data.id} editable />
);

export const config = defineWidgetConfig({ zone: "customer.details.after" });

export default CustomerPetsWidget;
