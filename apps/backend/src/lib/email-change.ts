import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { isPendingOrder, type OrderForDeletion } from "./account-deletion";

/**
 * Cambio de email de la cuenta (fase 13 punto 8, docs/fases/fase13-cuenta.md §2.6). Funciones
 * PURAS; el flujo está en `workflows/email-change`.
 *   1. «Mis datos»: email nuevo + contraseña → solicitud con token (solo el hash) que caduca a las
 *      `EMAIL_CHANGE_TTL_HOURS` horas y email al NUEVO con el enlace (`/cuenta/email/?token=…`).
 *   2. El enlace abre una página con un botón (POST): al confirmar cambian el email de acceso, el
 *      del cliente y el de sus pedidos EN CURSO (los terminados se quedan con el suyo), y se avisa
 *      al email antiguo. Consentimientos y avisos de stock van por cliente: no se tocan.
 */

export const EMAIL_CHANGE_TTL_HOURS = 24;

export const newEmailChangeToken = () => randomBytes(32).toString("base64url");

export const hashEmailChangeToken = (token: string) =>
  createHash("sha256").update(token, "utf8").digest("hex");

/** Compara el token del enlace con el hash guardado (tiempo constante). */
export function emailChangeTokenMatches(token: string, hash: string | null | undefined): boolean {
  if (!hash || !token || token.length > 200) return false;
  const a = Buffer.from(hashEmailChangeToken(token), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function emailChangeExpiry(now: Date, hours = EMAIL_CHANGE_TTL_HOURS): Date {
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

/** ¿Se puede usar la solicitud? Sin usar y sin caducar. */
export function emailChangeUsable(
  row: { used_at?: unknown; expires_at?: string | Date | null } | null | undefined,
  now = new Date(),
): boolean {
  if (!row || row.used_at || !row.expires_at) return false;
  return new Date(row.expires_at).getTime() > now.getTime();
}

/** Pedidos cuyo email se cambia: los EN CURSO (decisión del usuario). Igual que la baja. */
export const changesOrderEmail = (order: OrderForDeletion) => isPendingOrder(order);

export const EMAIL_CHANGE_MESSAGES = {
  password: "La contraseña no es correcta.",
  same: "Ese ya es el email de tu cuenta.",
  taken: "Ya hay una cuenta con ese email.",
  invalid: "El enlace no es válido o ha caducado. Vuelve a pedir el cambio desde «Mis datos».",
} as const;
