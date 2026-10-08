import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { MedusaError, Modules } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import { listSaleProductIds } from "../../../lib/ofertas";

/**
 * GET /store/ofertas?region_id= → `{ product_ids }` (fase I-Interficie, D5 = A).
 * Ids de los productos publicados del canal de la publishable key con alguna variante
 * rebajada por una Price List `sale` vigente en la región, por título. El storefront pide
 * luego esos productos a /store/products (mismos campos que el resto del catálogo).
 * Solo lectura: no hay workflow. Validación en src/api/middlewares.ts.
 * Fuente: context7 /medusajs/medusa (API routes, validateAndTransformQuery,
 * publishable_key_context.sales_channel_ids).
 */
export const StoreOfertasQuery = z.object({ region_id: z.string().min(1) });

export async function GET(req: MedusaStoreRequest, res: MedusaResponse) {
  const { region_id } = req.validatedQuery as z.infer<typeof StoreOfertasQuery>;
  const [region] = await req.scope
    .resolve(Modules.REGION)
    .listRegions({ id: region_id }, { select: ["id", "currency_code"] });
  if (!region) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Región ${region_id} no encontrada`);
  }
  const product_ids = await listSaleProductIds(req.scope, {
    regionId: region.id,
    currencyCode: region.currency_code,
    salesChannelIds: req.publishable_key_context?.sales_channel_ids ?? [],
  });
  res.json({ product_ids });
}
