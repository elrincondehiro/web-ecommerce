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
import { StoreOrderClaimBody } from "./store/customers/me/order-claims/route";
import { StoreOrderTransferQuery } from "./store/order-transfers/[id]/route";
import { PetBody, PetPhotoBody } from "../lib/pets-schema";
import { withStripeSessionData } from "../lib/stripe-session";
import { TRANSFER_PROVIDER_ID, transferConfig, transferGuarded } from "../lib/transfer";

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
 * Pedidos de invitado (Fase G-2): la ruta estándar de solicitar una transferencia deja pedir el
 * pedido de OTRA cuenta conociendo su id (spike G-0) y la solicitud bloquea el pedido. Se cierra:
 * las reclamaciones van solo por `/store/customers/me/order-claims` (solo pedidos de invitado).
 * `cancel` también (las solicitudes caducan solas o las cancela el Admin). `accept`/`decline`
 * siguen abiertas: exigen el token del email.
 */
const blockStoreTransferRequest = (_req: MedusaRequest, res: MedusaResponse) => {
  res.status(403).json({ type: "not_allowed", message: "Usa /store/customers/me/order-claims" });
};

/**
 * Pagos (Fase PG): la sesión de Stripe se crea SIEMPRE con los métodos y el modo de captura del
 * servidor (tarjeta, Link y PayPal se autorizan; Bizum se cobra al momento). Lo que mande el
 * navegador en `data` se sustituye (src/lib/stripe-session.ts). Va antes de la validación de
 * Medusa, que acepta `data` libre.
 */
const forceStripeSessionData = (
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction,
) => {
  if (req.body && typeof req.body === "object") {
    req.body = withStripeSessionData(req.body as { provider_id?: unknown; data?: unknown });
  }
  next();
};

/**
 * Transferencia (Fase PG-3): la sesión del pago manual solo con cliente con sesión y con IBAN
 * configurado (sin Stripe, CI y desarrollo, el pago manual es el de pruebas y no se limita). El
 * hook al completar (validar-carrito.ts) lo vuelve a comprobar sobre el carrito.
 */
const guardTransferSession = (
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction,
) => {
  const body = req.body as { provider_id?: unknown } | undefined;
  if (body?.provider_id !== TRANSFER_PROVIDER_ID || !transferGuarded()) return next();
  const actor = (req as MedusaRequest & { auth_context?: { actor_id?: string } }).auth_context
    ?.actor_id;
  if (!transferConfig().enabled || !actor) {
    res.status(400).json({
      type: "not_allowed",
      message: "El pago por transferencia solo está disponible para clientes con cuenta.",
    });
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
    // Pedidos de invitado (Fase G-2)
    {
      matcher: "/store/orders/:id/transfer/request",
      middlewares: [blockStoreTransferRequest],
    },
    {
      matcher: "/store/orders/:id/transfer/cancel",
      middlewares: [blockStoreTransferRequest],
    },
    {
      matcher: "/store/customers/me/order-claims",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(StoreOrderClaimBody)],
    },
    {
      matcher: "/store/order-transfers/:id",
      methods: ["GET"],
      middlewares: [validateAndTransformQuery(StoreOrderTransferQuery, {})],
    },
    // Lista de deseos (Fase L-1). La autenticación la pone Medusa (`/store/customers/me*`).
    {
      matcher: "/store/customers/me/wishlist/items",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(StoreAddWishlistItemBody)],
    },
    // Pagos (Fase PG): métodos y captura de Stripe impuestos por el servidor.
    {
      matcher: "/store/payment-collections/:id/payment-sessions",
      methods: ["POST"],
      middlewares: [
        authenticate("customer", ["bearer", "session"], { allowUnauthenticated: true }),
        forceStripeSessionData,
        guardTransferSession,
      ],
    },
    // Mascotas (Fase M). La autenticación la pone Medusa (`/store/customers/me*`, `/admin*`).
    // La foto llega ya reducida (WebP ~50–150 KB en base64): límite de 1 MB solo en esa ruta
    // (context7 /medusajs/medusa, «parse-body»: `bodyParser.sizeLimit`; por defecto 100 KB).
    {
      matcher: "/store/customers/me/pets",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PetBody)],
    },
    {
      matcher: "/store/customers/me/pets/:id",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PetBody)],
    },
    {
      matcher: "/store/customers/me/pets/:id/photo",
      methods: ["POST"],
      bodyParser: { sizeLimit: "1mb" },
      middlewares: [validateAndTransformBody(PetPhotoBody)],
    },
    {
      matcher: "/admin/customers/:id/pets",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PetBody)],
    },
    {
      matcher: "/admin/customers/:id/pets/:petId",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PetBody)],
    },
    {
      matcher: "/admin/customers/:id/pets/:petId/photo",
      methods: ["POST"],
      bodyParser: { sizeLimit: "1mb" },
      middlewares: [validateAndTransformBody(PetPhotoBody)],
    },
  ],
});
