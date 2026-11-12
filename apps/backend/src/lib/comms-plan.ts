import { COMMS_TOPIC_IDS, commsTopic, type CommsTopicId, type CommsTopicState } from "./comms";

/**
 * Reglas PURAS de los consentimientos (Fase MK-A): qué abrir y qué cerrar para dejar al cliente
 * con los temas elegidos, y el estado que ve en su cuenta.
 */
export type ActiveConsent = { id: string; topic: CommsTopicId; granted_at: Date | string };

export type ConsentPlan = {
  /** Temas que se activan ahora (fila nueva con la versión vigente del texto). */
  grant: { topic: CommsTopicId; text_version: number }[];
  /** Filas activas que se cierran. */
  revoke: string[];
};

/** Pasar de los consentimientos activos a `wanted` (los no elegidos se quitan). */
export function consentPlan(active: ActiveConsent[], wanted: CommsTopicId[]): ConsentPlan {
  const want = new Set(wanted);
  const has = new Set(active.map((a) => a.topic));
  return {
    grant: COMMS_TOPIC_IDS.filter((t) => want.has(t) && !has.has(t)).map((topic) => ({
      topic,
      text_version: commsTopic(topic).version,
    })),
    revoke: active.filter((a) => !want.has(a.topic)).map((a) => a.id),
  };
}

/** Todos los temas, en orden, con si están activos y desde cuándo. */
export function consentStates(active: ActiveConsent[]): CommsTopicState[] {
  return COMMS_TOPIC_IDS.map((id) => {
    const row = active.find((a) => a.topic === id);
    return {
      id,
      granted: Boolean(row),
      granted_at: row ? new Date(row.granted_at).toISOString() : null,
    };
  });
}
