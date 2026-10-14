import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import { CORREA_VARIANT_META, isCorrea, variantLength } from "../../../../lib/correas";
import {
  loadAvailable,
  loadKitLinks,
  variantUnits,
  type KitLink,
} from "../../../../lib/kit-demand";

/**
 * GET /store/correas/disponibilidad → `{ correas: [{ handle, max_m, masks }] }` (Fase E-2).
 *
 * Para la landing de la correa (server island del storefront, E-2c: «hasta 8 m» / «Agotada» por
 * color): por correa publicada del canal de la publishable key,
 *   - `max_m`: largo más largo que se puede pedir con alguna combinación de mosquetones
 *     (0 = agotada);
 *   - `masks`: largo → máscara de 9 bits (lado perro × lado mano, en el orden de las opciones)
 *     con las combinaciones disponibles. Así el storefront desactiva las agotadas.
 * Solo indicadores, nunca cantidades (ni metros de cuerda que quedan). Mismo cálculo que Medusa
 * (`getVariantAvailability`: mínimo de floor(libre / required_quantity) del kit).
 * Solo lectura: no hay workflow. La caché la pone el storefront (server island, s-maxage 60).
 */
export const StoreCorreasQuery = z.object({});

/**
 * Enlaces de kit en memoria del proceso, 5 min. Son ESTRUCTURA (qué piezas lleva cada variante;
 * solo cambian con `correas:sync`), no stock, y son lo caro de la ruta (~3300 filas, ~150 ms). El
 * stock libre se lee siempre fresco. No se usa la caché de Query de Medusa: en 2.21.2 está detrás
 * del feature flag `MEDUSA_FF_CACHING` («[WIP]», apagado; @medusajs/medusa feature-flags/caching).
 * El carrito no pasa por aquí: valida siempre con datos frescos (hook validar-carrito).
 */
const KIT_LINKS_TTL_MS = 5 * 60 * 1000;
let kitMemo: { key: string; at: number; links: Promise<KitLink[]> } | null = null;

function cachedKitLinks(scope: MedusaStoreRequest["scope"], variantIds: string[]) {
  const key = [...variantIds].sort().join(",");
  const now = Date.now();
  if (!kitMemo || kitMemo.key !== key || now - kitMemo.at > KIT_LINKS_TTL_MS) {
    const links = loadKitLinks(scope, variantIds);
    kitMemo = { key, at: now, links };
    links.catch(() => (kitMemo = null));
  }
  return kitMemo.links;
}

type Row = Record<string, unknown>;

export interface CorreaAvailability {
  handle: string;
  max_m: number;
  masks: Record<string, number>;
}

/** Código de mosquetón → posición (orden de los valores de la opción, = orden de mosquetones.csv). */
export function clipOrder(variants: { metadata: Record<string, unknown> | null }[]) {
  const order: string[] = [];
  for (const v of variants) {
    const code = v.metadata?.[CORREA_VARIANT_META.dogClip];
    if (typeof code === "string" && !order.includes(code)) order.push(code);
  }
  return order;
}

export function availabilityOf(
  handle: string,
  variants: { id: string; metadata: Record<string, unknown> | null }[],
  units: Map<string, number>,
): CorreaAvailability {
  const order = clipOrder(variants);
  const masks: Record<string, number> = {};
  let max = 0;
  for (const v of variants) {
    const m = variantLength(v.metadata);
    const dog = order.indexOf(v.metadata?.[CORREA_VARIANT_META.dogClip] as string);
    const hand = order.indexOf(v.metadata?.[CORREA_VARIANT_META.handClip] as string);
    if (m === null || dog < 0 || hand < 0) continue;
    masks[m] ??= 0;
    if ((units.get(v.id) ?? 0) > 0) {
      masks[m] |= 1 << (dog * order.length + hand);
      max = Math.max(max, m);
    }
  }
  return { handle, max_m: max, masks };
}

export async function GET(req: MedusaStoreRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const salesChannelIds = req.publishable_key_context?.sales_channel_ids ?? [];
  // 1.º id + metadata de los publicados con el módulo de producto (sin enlaces: barato);
  // 2.º canal de venta y variantes solo de las correas
  const all = await req.scope
    .resolve(Modules.PRODUCT)
    .listProducts({ status: "published" }, { select: ["id", "metadata"], take: null });
  const ids = all.filter((p) => isCorrea(p.metadata)).map((p) => p.id);
  if (!ids.length) {
    res.json({ correas: [] });
    return;
  }
  const { data } = await query.graph({
    entity: "product",
    fields: ["handle", "sales_channels.id", "variants.id", "variants.metadata"],
    filters: { id: ids },
  });
  const products = (data as Row[]).filter((p) =>
    ((p.sales_channels as Row[] | null) ?? []).some((s) =>
      salesChannelIds.includes(s.id as string),
    ),
  );
  const variants = products.flatMap((p) => ((p.variants as Row[] | null) ?? []) as Row[]);
  const links = await cachedKitLinks(
    req.scope,
    variants.map((v) => v.id as string),
  );
  const available = await loadAvailable(
    req.scope,
    [...new Set(links.map((l) => l.inventory_item_id))],
    salesChannelIds[0],
  );
  const units = variantUnits(links, available);
  res.json({
    correas: products.map((p) =>
      availabilityOf(
        p.handle as string,
        ((p.variants as Row[] | null) ?? []).map((v) => ({
          id: v.id as string,
          metadata: (v.metadata as Record<string, unknown> | null) ?? null,
        })),
        units,
      ),
    ),
  });
}
