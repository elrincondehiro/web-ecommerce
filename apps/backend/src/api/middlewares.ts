import {
  configureStoreSearch,
  defineMiddlewares,
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework/http";
import { StoreDeletionRequestBody } from "./store/customers/me/deletion-request/route";
import { StoreOfertasQuery } from "./store/ofertas/route";

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
    // Solicitud de baja (fase 9). La autenticación la pone Medusa (`/store/customers/me*`).
    {
      matcher: "/store/customers/me/deletion-request",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(StoreDeletionRequestBody)],
    },
  ],
});
