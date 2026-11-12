/**
 * Comunicaciones comerciales (Fase MK-A, docs/fases/faseMK-marketing.md): temas que el cliente
 * activa o quita en «Mi cuenta → Comunicaciones». Todos empiezan apagados (consentimiento
 * expreso, LSSI art. 21 y RGPD art. 7). Funciones PURAS, sin I/O.
 *
 * Copia IDÉNTICA en apps/backend/src/lib/comms.ts y apps/storefront/src/lib/comms.ts (los tests
 * comprueban que son idénticas). Cambia las dos a la vez.
 *
 * `version`: súbela al cambiar el texto de un tema. Cada consentimiento guarda la versión que se
 * aceptó (prueba de qué se aceptó); el cliente sigue suscrito, pero se sabe con qué texto.
 */
export const COMMS_TOPICS = [
  {
    id: "novedades",
    title: "Novedades y ofertas",
    description:
      "Productos nuevos, ofertas y alguna noticia de la tienda. Pocos emails, sin agobiar.",
    version: 1,
  },
  {
    id: "cumpleanos",
    title: "Cumpleaños de mis peques",
    description:
      "Una felicitación el día del cumpleaños de tus mascotas de «Mis peques» (si sabemos el día o el mes).",
    version: 1,
  },
  {
    id: "gincana",
    title: "Gincana de huellas",
    description: "Un aviso cuando escondamos huellas nuevas con premio por la tienda.",
    version: 1,
  },
] as const;

export type CommsTopic = (typeof COMMS_TOPICS)[number];
export type CommsTopicId = CommsTopic["id"];

export const COMMS_TOPIC_IDS = COMMS_TOPICS.map((t) => t.id) as CommsTopicId[];

export function isCommsTopic(value: unknown): value is CommsTopicId {
  return typeof value === "string" && (COMMS_TOPIC_IDS as string[]).includes(value);
}

export function commsTopic(id: CommsTopicId): CommsTopic {
  return COMMS_TOPICS.find((t) => t.id === id)!;
}

/** Temas válidos y sin repetir, en el orden de COMMS_TOPICS (lo demás se ignora). */
export function parseCommsTopics(values: readonly unknown[]): CommsTopicId[] {
  const set = new Set(values.filter(isCommsTopic));
  return COMMS_TOPIC_IDS.filter((id) => set.has(id));
}

/** Estado de un tema para un cliente (lo que devuelve el backend). */
export interface CommsTopicState {
  id: CommsTopicId;
  granted: boolean;
  /** Fecha ISO de la última vez que lo activó (null si nunca o quitado). */
  granted_at: string | null;
}
