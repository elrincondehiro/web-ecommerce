/**
 * Pedidos de invitado → cuenta (Fase G). Reglas PURAS (sin BD) para poder probarlas.
 *
 * Medusa 2.21.2 guarda la compra sin cuenta en un cliente aparte (`has_account = false`) y no deja
 * cambiar `has_account` (context7 /medusajs/medusa, «customer-accounts»). Los pedidos se pasan a
 * la cuenta con la transferencia oficial (order change `TRANSFER_CUSTOMER`): queda en el historial
 * del Admin y se deshace con «transferir a invitado» (spike G-0, docs/fases/faseG-invitados.md).
 */

/** Motivo (en `order_change.description`) de las transferencias que hace el backend solo. */
export const AUTO_TRANSFER = {
  /** Mismo email que la cuenta (G-1): al crear la cuenta o al comprar sin entrar. */
  sameEmail: "auto:mismo-email",
  /** Asignación manual desde la terminal (G-3, `orders:assign`). */
  manual: "auto:manual",
} as const;

export type AutoTransferReason = (typeof AUTO_TRANSFER)[keyof typeof AUTO_TRANSFER];

/**
 * Motivo de una reclamación del cliente (G-2): pedido hecho con OTRO email. Necesita que el dueño
 * de ese email acepte desde el enlace que le llega (subscriber `order.transfer_requested`).
 */
export const CLAIM_TRANSFER = "reclamacion";

/** Solicitudes de reclamación pendientes por cliente (G-2): más, se ignoran en silencio. */
export const MAX_PENDING_CLAIMS = 3;

export const ORDER_TRANSFER_DEFAULT_TTL_DAYS = 7;
export const ORDER_TRANSFER_EXPIRE_DEFAULT_CRON = "15 4 * * *";

/** `ORDER_TRANSFER_TTL_DAYS`: entero 1–60, o 7. Una solicitud pendiente bloquea el pedido (G-0). */
export function transferTtlDays(raw: string | undefined): number {
  const n = Number(raw);
  return raw !== undefined && raw !== "" && Number.isInteger(n) && n >= 1 && n <= 60
    ? n
    : ORDER_TRANSFER_DEFAULT_TTL_DAYS;
}

/** Email enmascarado para el aviso al dueño del pedido: «j***@gmail.com». */
export function maskEmail(raw: string | null | undefined): string {
  const email = normalizeEmail(raw);
  if (!email) return "una cuenta";
  const at = email.lastIndexOf("@");
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}

/** ¿La transferencia la hizo el backend solo (sin email de aceptación)? */
export function isAutoTransfer(description: string | null | undefined): boolean {
  return typeof description === "string" && description.startsWith("auto:");
}

/**
 * Marca en `order.metadata` de los pedidos pasados a una cuenta (insignia «Añadido a tu cuenta»
 * en «Mis pedidos», opción b). `metadata` sale en la Store API sin pedir campos extra; el
 * historial (`order_change`) no se puede pedir desde la Store API (query-config de 2.21.2).
 */
export const LINKED_META_KEY = "cuenta_vinculada";

export type LinkedMeta = { at: string; reason: string };

export function linkedMeta(
  metadata: Record<string, unknown> | null | undefined,
): LinkedMeta | null {
  const v = metadata?.[LINKED_META_KEY] as Partial<LinkedMeta> | undefined;
  return v && typeof v.at === "string" ? { at: v.at, reason: String(v.reason ?? "") } : null;
}

/** Email normalizado como lo guarda Medusa (`validateEmail` lo pasa a minúsculas). */
export function normalizeEmail(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().toLowerCase();
  return v.includes("@") ? v : null;
}

/** `POINTS_RETROACTIVE`: por defecto activado; solo `false`/`0`/`no`/`off` lo apagan. */
export function retroactiveEnabled(raw: string | undefined): boolean {
  const v = (raw ?? "").trim().toLowerCase();
  return !(v === "false" || v === "0" || v === "no" || v === "off");
}

export const POINTS_ACCRUE_DEFAULT_LOOKBACK_DAYS = 120;

/** `POINTS_ACCRUE_LOOKBACK_DAYS`: entero 1–3650, o 120. */
export function lookbackDays(raw: string | undefined): number {
  const n = Number(raw);
  return raw !== undefined && raw !== "" && Number.isInteger(n) && n >= 1 && n <= 3650
    ? n
    : POINTS_ACCRUE_DEFAULT_LOOKBACK_DAYS;
}

/**
 * Con `POINTS_RETROACTIVE` apagado, un pedido hecho ANTES de crear la cuenta no da puntos
 * (aunque se haya pasado a ella). Los hechos después (comprar sin entrar, C1) sí.
 */
export function earnsPoints(
  order: { created_at?: string | Date | null },
  account: { created_at?: string | Date | null } | null | undefined,
  retroactive: boolean,
): boolean {
  if (retroactive) return true;
  if (!order.created_at || !account?.created_at) return true;
  return new Date(order.created_at).getTime() >= new Date(account.created_at).getTime();
}
