import { createHmac, timingSafeEqual } from "node:crypto";
import { isCommsTopic, type CommsTopicId } from "./comms";

/**
 * Token del enlace de baja de un email comercial (Fase MK-A): `<cliente>.<tema>.<firma>`, con la
 * firma HMAC-SHA256 de `COMMS_UNSUBSCRIBE_SECRET`. No se guarda en la BD ni caduca (una baja tiene
 * que funcionar aunque el email sea antiguo; RFC 8058). Solo sirve para QUITAR ese tema a ese
 * cliente: aunque se filtre, no da acceso a nada más.
 * El id del cliente va a la vista en la URL del email (no es un dato personal por sí solo).
 */
export type UnsubscribePayload = { customer_id: string; topic: CommsTopicId };

const ID = /^cus_[0-9A-Z]{10,40}$/;

function secret(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.COMMS_UNSUBSCRIBE_SECRET ?? "";
  if (value.length < 32) {
    throw new Error("COMMS_UNSUBSCRIBE_SECRET debe tener al menos 32 caracteres");
  }
  return value;
}

const sign = (body: string, key: string) =>
  createHmac("sha256", key).update(`comms-baja/${body}`).digest("base64url");

export function unsubscribeToken(
  payload: UnsubscribePayload,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const body = `${payload.customer_id}.${payload.topic}`;
  return `${body}.${sign(body, secret(env))}`;
}

/** El cliente y el tema del token, o null si no es válido (formato o firma). */
export function readUnsubscribeToken(
  token: string,
  env: NodeJS.ProcessEnv = process.env,
): UnsubscribePayload | null {
  if (typeof token !== "string" || token.length > 200) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [customerId, topic, signature] = parts as [string, string, string];
  if (!ID.test(customerId) || !isCommsTopic(topic)) return null;
  const expected = Buffer.from(sign(`${customerId}.${topic}`, secret(env)));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return { customer_id: customerId, topic };
}
