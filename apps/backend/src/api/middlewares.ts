import {
  authenticate,
  configureStoreSearch,
  defineMiddlewares,
  validateAndTransformBody,
  validateAndTransformQuery,
  type MedusaNextFunction,
  type MedusaRequest,
  type MedusaResponse,
} from "@medusajs/framework/http";
import { StoreDeletionRequestBody } from "./store/customers/me/deletion-request/route";
import { StoreCorreasQuery } from "./store/correas/disponibilidad/route";
import { StoreOfertasQuery } from "./store/ofertas/route";
import { StoreAddWishlistItemBody } from "./store/customers/me/wishlist/items/route";
import { StoreApplyPointsBody } from "./store/carts/[id]/points/route";
import { AdminAdjustPointsBody } from "./admin/customers/[id]/points/route";
import { StoreApplyCodeBody } from "./store/carts/[id]/code/route";

/**
 * Códigos descuento (Fase P): la Store API estándar deja aplicar códigos a cualquiera (también a
 * invitados, spike P-0). Se cierra: los códigos solo van por `/store/carts/:id/code` (cliente con
 * cuenta, uno por pedido). Bloquea `/store/carts/:id/promotions` y `promo_codes` al crear o
 * actualizar el carrito. Los puntos (PTS-) los aplica el backend por dentro, no por esta API.
 */
const blockStorePromotions = (_req: MedusaRequest, res: MedusaResponse) => {
  res.status(403).json({ type: "not_allowed", message: "Usa /store/carts/:id/code" });
};
const noPromoCodes = (req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => {
  const body = req.body as { promo_codes?: unknown } | undefined;
  if (body && body.promo_codes !== undefined) {
    res.status(403).json({ type: "not_allowed", message: "Usa /store/carts/:id/code" });
    return;
  }
  next();
};

/**
 * Fuente: docs.medusajs.com/llms-full.txt ("Store Search API Route").
 * `POST /store/search` no expone ningún índice salvo los permitidos aquí. Para el índice
 * `product`, Medusa añade los filtros de `status = published` y del canal de venta de la
 * publishable key (ver `src/search/product.ts`).
 */
export default defineMiddlewares({
  routes: [
    {
      matcher: "/store/search",
      middlewares: [configureStoreSearch({ allowed_indexes: { product: true } })],
    },
    // Productos en oferta (fase I-Interficie): `region_id` obligatorio.
    {
      matcher: "/store/ofertas",
      methods: ["GET"],
      middlewares: [validateAndTransformQuery(StoreOfertasQuery, {})],
    },
    // Disponibilidad de las correas a medida (Fase E-2): sin parámetros.
    {
      matcher: "/store/correas/disponibilidad",
      methods: ["GET"],
      middlewares: [validateAndTransformQuery(StoreCorreasQuery, {})],
    },
    // Solicitud de baja (fase 9). La autenticación la pone Medusa (`/store/customers/me*`).
    {
      matcher: "/store/customers/me/deletion-request",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(StoreDeletionRequestBody)],
    },
    // Códigos descuento (Fase P): solo por la ruta propia (ver blockStorePromotions).
    {
      matcher: "/store/carts/:id/promotions",
      middlewares: [blockStorePromotions],
    },
    { matcher: "/store/carts", methods: ["POST"], middlewares: [noPromoCodes] },
    { matcher: "/store/carts/:id", methods: ["POST"], middlewares: [noPromoCodes] },
    {
      matcher: "/store/carts/:id/code",
      methods: ["POST", "DELETE"],
      middlewares: [authenticate("customer", ["bearer", "session"])],
    },
    {
      matcher: "/store/carts/:id/code",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(StoreApplyCodeBody)],
    },
    // Puntos (Fase L-2): usar/quitar en el carrito, solo con sesión de cliente (el workflow
    // comprueba que el carrito es suyo). /admin* lo protege Medusa.
    {
      matcher: "/store/carts/:id/points",
      methods: ["POST", "DELETE"],
      middlewares: [authenticate("customer", ["bearer", "session"])],
    },
    {
      matcher: "/store/carts/:id/points",
      methods: ["GET"],
      middlewares: [
        authenticate("customer", ["bearer", "session"], { allowUnauthenticated: true }),
      ],
    },
    {
      matcher: "/store/carts/:id/points",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(StoreApplyPointsBody)],
    },
    {
      matcher: "/admin/customers/:id/points",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(AdminAdjustPointsBody)],
    },
    // Lista de deseos (Fase L-1). La autenticación la pone Medusa (`/store/customers/me*`).
    {
      matcher: "/store/customers/me/wishlist/items",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(StoreAddWishlistItemBody)],
    },
  ],
});
