import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { quietMinutes, shouldPublish } from "../../../lib/storefront-publish";
import { STOREFRONT_PUBLISH_MODULE } from "../../../modules/storefront-publish";
import type StorefrontPublishModuleService from "../../../modules/storefront-publish/service";

/** GET /admin/storefront-publish (fase 13): estado de la publicación del catálogo. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const state = await req.scope
    .resolve<StorefrontPublishModuleService>(STOREFRONT_PUBLISH_MODULE)
    .read();
  res.json({
    state,
    next: shouldPublish(state, new Date()),
    quiet_minutes: quietMinutes(),
    configured: Boolean(process.env.STOREFRONT_REBUILD_SECRET),
  });
}

/** POST /admin/storefront-publish: «Publicar ahora» (sin esperar; lo recoge el homelab). */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const state = await req.scope
    .resolve<StorefrontPublishModuleService>(STOREFRONT_PUBLISH_MODULE)
    .update((s) => ({ ...s, requested_at: s.requested_at ?? new Date() }));
  res.json({ state });
}
