// Correa a medida (Fase E-2c), servidor: tarjetas en vivo de las correas (LiveSync de listados y
// /buscar/) sin pedir los productos enteros. Los datos de cada tarjeta (lib/correa.ts
// `correaCards`) salen del build: src/pages/listados/correas.json.ts → dist/server/
// correa-cards.json (integración `privateBuildManifests`, astro.config.mjs). En `astro dev` se
// calculan del catálogo. En runtime solo se piden las variantes del largo más corto (precio
// «Desde» y stock), con `GET /store/product-variants`.
import type { StoreProduct, StoreVariant } from "./catalog";
import { readBuildManifest } from "./build-manifest";
import {
  CORREA_CARDS_MANIFEST,
  CORREA_GROUP_ID,
  cardProduct,
  correaCards,
  tableVariantIds,
  type CorreaCard,
  type CorreaCards,
} from "./correa";
import { getListedProducts, getVariantsFresh } from "./medusa";

let devCards: Promise<CorreaCards | null> | undefined;

/** Tarjetas de correa del build (null si no hay correas). */
export async function getCorreaCards(): Promise<CorreaCards | null> {
  if (import.meta.env.DEV) return (devCards ??= getListedProducts().then(correaCards));
  const m = readBuildManifest<unknown>(CORREA_CARDS_MANIFEST);
  const group = m.get("group") as CorreaCard | undefined;
  const members = m.get("members") as Record<string, CorreaCard> | undefined;
  return group && members ? { group, members } : null;
}

/** Tarjeta de un id (grupo o correa), o undefined. */
export function cardOf(cards: CorreaCards | null, id: string): CorreaCard | undefined {
  if (!cards) return undefined;
  return id === CORREA_GROUP_ID ? cards.group : cards.members[id];
}

/**
 * Productos mínimos con precio y stock actuales para los ids de correa (grupo o color) de la
 * lista; el resto se ignora. Una sola petición para todos.
 */
export async function freshCorreaCards(
  ids: readonly string[],
  cards: CorreaCards | null,
): Promise<Map<string, StoreProduct>> {
  const wanted = ids.flatMap((id) => {
    const card = cardOf(cards, id);
    return card ? [[id, card] as const] : [];
  });
  if (!wanted.length) return new Map();
  const variants = await getVariantsFresh([...new Set(wanted.flatMap(([, c]) => c.v))]);
  return new Map(wanted.map(([id, card]) => [id, cardProduct(id, card, variants)]));
}

/** Variantes de la tabla de precios de la landing (las correas de `ids`: una por material). */
export async function freshTableVariants(
  ids: readonly string[],
  cards: CorreaCards | null,
): Promise<StoreVariant[]> {
  const wanted = ids.flatMap((id) => {
    const card = cards?.members[id];
    return card ? tableVariantIds(card) : [];
  });
  return getVariantsFresh([...new Set(wanted)]);
}
