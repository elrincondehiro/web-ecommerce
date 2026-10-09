import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/**
 * GET /store/customers/me/carts → `{ cart_id }` (fase 9): el carrito sin completar MÁS RECIENTE
 * del cliente con sesión que tenga artículos, o `null`. El storefront lo carga al entrar si el
 * navegador no tiene carrito (el carrito "sigue" al cliente entre dispositivos; opción a: si el
 * navegador ya tiene uno, gana ese y el de la cuenta se queda guardado).
 * Medusa 2.21.2 no tiene ruta de la Store API para listar carritos del cliente (solo crear,
 * leer por id y transferir). Solo lectura: no hay workflow. Solo se devuelve el id; los datos
 * se leen después con GET /store/carts/:id (campos de la Store API).
 * La sesión la exige Medusa (`/store/customers/me*`). Filtra también por los canales de la
 * publishable key, como el resto de la Store API.
 * Fuente: context7 /medusajs/medusa (API routes, query.graph con filtros y orden).
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const salesChannelIds = req.publishable_key_context?.sales_channel_ids ?? [];
  const { data: carts } = await query.graph({
    entity: "cart",
    fields: ["id", "items.id"],
    filters: {
      customer_id: req.auth_context.actor_id,
      completed_at: null,
      ...(salesChannelIds.length ? { sales_channel_id: salesChannelIds } : {}),
    },
    // Los últimos 10 por actividad: el primero con artículos (los vacíos no se recuperan).
    pagination: { take: 10, skip: 0, order: { updated_at: "DESC" } },
  });
  const cart = carts.find((c) => (c.items?.length ?? 0) > 0);
  res.json({ cart_id: cart?.id ?? null });
}
