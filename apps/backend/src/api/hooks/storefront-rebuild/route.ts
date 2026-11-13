import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { z } from "@medusajs/framework/zod";
import {
  REBUILD_SECRET_HEADER,
  onFinish,
  onQueued,
  onStart,
  shouldPublish,
  validSecret,
} from "../../../lib/storefront-publish";
import { STOREFRONT_PUBLISH_MODULE } from "../../../modules/storefront-publish";
import type StorefrontPublishModuleService from "../../../modules/storefront-publish/service";

/**
 * Publicación del catálogo (fase 13), para el homelab. Fuera de Internet: Caddy no la expone en la
 * tienda y en `api.` el WAF de Cloudflare solo deja `POST /hooks/payment/*`; llega por WireGuard.
 * Secreto compartido en `x-rebuild-secret` (`STOREFRONT_REBUILD_SECRET`); sin él configurado, 404.
 *
 *   GET  → { publish, reason }  (el temporizador del homelab pregunta cada pocos minutos)
 *   POST { event: "queued" }  (el homelab, tras lanzar el workflow)
 *        { event: "started", run_url } | { event: "finished", ok, error? }  (el workflow)
 */
export const HookRebuildBody = z.discriminatedUnion("event", [
  z.object({ event: z.literal("queued") }),
  z.object({ event: z.literal("started"), run_url: z.string().url().max(500).nullish() }),
  z.object({
    event: z.literal("finished"),
    ok: z.boolean(),
    error: z.string().max(1000).nullish(),
  }),
]);

const service = (req: MedusaRequest) =>
  req.scope.resolve<StorefrontPublishModuleService>(STOREFRONT_PUBLISH_MODULE);

function authorized(req: MedusaRequest, res: MedusaResponse): boolean {
  if (!process.env.STOREFRONT_REBUILD_SECRET) {
    res.status(404).json({ message: "Not found" });
    return false;
  }
  if (!validSecret(req.get(REBUILD_SECRET_HEADER))) {
    res.status(401).json({ message: "Unauthorized" });
    return false;
  }
  return true;
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  if (!authorized(req, res)) return;
  res.json(shouldPublish(await service(req).read(), new Date()));
}

export async function POST(
  req: MedusaRequest<z.infer<typeof HookRebuildBody>>,
  res: MedusaResponse,
) {
  if (!authorized(req, res)) return;
  const body = req.validatedBody;
  const now = new Date();
  const state = await service(req).update((s) =>
    body.event === "queued"
      ? onQueued(s, now)
      : body.event === "started"
        ? onStart(s, now, body.run_url ?? null)
        : onFinish(s, now, body.ok, body.error ?? null),
  );
  res.json({ status: state.status });
}
