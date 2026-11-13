import { timingSafeEqual } from "node:crypto";

/**
 * Publicar el catálogo en la tienda (rebuild del storefront, fase 13). Las fichas, listados y
 * categorías son HTML generado en el build: un producto, foto, categoría u oferta nuevos no salen
 * hasta el siguiente. Aquí solo se lleva el ESTADO; el build lo hace el runner de Gitea del
 * homelab (workflow `storefront-rebuild.yml`), que pregunta por WireGuard cada pocos minutos
 * (`GET /hooks/storefront-rebuild`) y avisa al empezar y al terminar (`POST`).
 * Precio y stock no necesitan rebuild (LiveSync los corrige en vivo).
 * Detalle: docs/fases/fase13-rebuild.md.
 */

/** Eventos de catálogo que cambian el HTML del storefront (Medusa 2.22.6, core-flows/events). */
export const CATALOG_EVENTS = [
  "product.created",
  "product.updated",
  "product.deleted",
  "product-variant.created",
  "product-variant.updated",
  "product-variant.deleted",
  "product-option.created",
  "product-option.updated",
  "product-option.deleted",
  "product-option-value.updated",
  "product-option-value.deleted",
  "product-category.created",
  "product-category.updated",
  "product-category.deleted",
  "product-collection.created",
  "product-collection.updated",
  "product-collection.deleted",
  "product-tag.created",
  "product-tag.updated",
  "product-tag.deleted",
  "price-list.created",
  "price-list.updated",
  "price-list.deleted",
  "price-list.prices_added",
  "price-list.prices_updated",
  "price-list.prices_removed",
] as const;

/** `queued`: el homelab ha lanzado el workflow y espera runner (puede haber un CI delante). */
export const PUBLISH_STATUSES = ["idle", "queued", "running", "ok", "failed"] as const;
export type PublishStatus = (typeof PUBLISH_STATUSES)[number];

/** Estado guardado (una sola fila). */
export type PublishState = {
  /** Primer cambio sin publicar (null = nada pendiente). */
  pending_since: Date | null;
  /** Último cambio sin publicar: la espera cuenta desde aquí. */
  last_change_at: Date | null;
  /** «Publicar ahora» del Admin: sin espera. */
  requested_at: Date | null;
  status: PublishStatus;
  /** Cuándo empezó la publicación en curso o la última. */
  started_at: Date | null;
  finished_at: Date | null;
  /** Enlace a la ejecución del workflow (Gitea). */
  run_url: string | null;
  /** Motivo del último fallo (lo manda el workflow; sin secretos). */
  error: string | null;
};

export const EMPTY_STATE: PublishState = {
  pending_since: null,
  last_change_at: null,
  requested_at: null,
  status: "idle",
  started_at: null,
  finished_at: null,
  run_url: null,
  error: null,
};

/** Minutos sin cambios antes de publicar (`STOREFRONT_REBUILD_QUIET_MIN`, 1–120; 10). */
export function quietMinutes(env = process.env.STOREFRONT_REBUILD_QUIET_MIN): number {
  const n = Number(env);
  return Number.isInteger(n) && n >= 1 && n <= 120 ? n : 10;
}

/** Una publicación «colgada» (el runner se apagó a medias) deja de bloquear a los 60 min. */
export const RUN_TIMEOUT_MS = 60 * 60_000;

/**
 * ¿Hay que lanzar el build ahora? Hay cambios (o se pidió desde el Admin), no hay otro en curso
 * y han pasado `quiet` minutos desde el último cambio (con el botón, sin espera).
 */
export function shouldPublish(
  s: PublishState,
  now: Date,
  quiet = quietMinutes(),
): { publish: boolean; reason: string } {
  const busy = (s.status === "running" || s.status === "queued") && s.started_at;
  if (busy && now.getTime() - s.started_at!.getTime() < RUN_TIMEOUT_MS) {
    return { publish: false, reason: s.status === "queued" ? "en cola" : "en curso" };
  }
  if (s.requested_at) return { publish: true, reason: "pedido desde el Admin" };
  if (!s.pending_since || !s.last_change_at) return { publish: false, reason: "sin cambios" };
  const waited = now.getTime() - s.last_change_at.getTime();
  if (waited < quiet * 60_000) {
    return { publish: false, reason: `esperando ${quiet} min sin cambios` };
  }
  return { publish: true, reason: "cambios de catálogo" };
}

/** Un cambio de catálogo: abre (o alarga) la espera. */
export function onChange(s: PublishState, now: Date): PublishState {
  return { ...s, pending_since: s.pending_since ?? now, last_change_at: now };
}

/**
 * El homelab ha lanzado el workflow (aún en cola): lo pendiente pasa a esta publicación y no se
 * vuelve a lanzar mientras espera runner. Si nunca empieza, a los 60 min se reintenta.
 */
export function onQueued(s: PublishState, now: Date): PublishState {
  return { ...onStart(s, now, null), status: "queued" };
}

/**
 * El workflow empieza: lo pendiente pasa a «publicando». Los cambios que lleguen durante el
 * build vuelven a abrir `pending_since` (saldrán en el siguiente).
 */
export function onStart(s: PublishState, now: Date, runUrl: string | null): PublishState {
  return {
    ...s,
    pending_since: null,
    last_change_at: null,
    requested_at: null,
    status: "running",
    started_at: now,
    finished_at: null,
    run_url: runUrl,
    error: null,
  };
}

export function onFinish(
  s: PublishState,
  now: Date,
  ok: boolean,
  error: string | null,
): PublishState {
  return {
    ...s,
    status: ok ? "ok" : "failed",
    finished_at: now,
    error: ok ? null : (error ?? "sin detalle").slice(0, 300),
    // Si falló, lo que iba en ese build sigue pendiente (se reintenta tras la espera)
    ...(ok
      ? {}
      : {
          pending_since: s.pending_since ?? s.started_at,
          last_change_at: s.last_change_at ?? now,
        }),
  };
}

/** Cabecera del secreto compartido con el homelab y el workflow. */
export const REBUILD_SECRET_HEADER = "x-rebuild-secret";

/** Comprueba el secreto (`STOREFRONT_REBUILD_SECRET`, ≥ 32 caracteres) sin filtrar tiempos. */
export function validSecret(
  given: string | undefined,
  secret = process.env.STOREFRONT_REBUILD_SECRET,
): boolean {
  if (!secret || secret.length < 32 || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
