import { model } from "@medusajs/framework/utils";
import { COMMS_TOPIC_IDS } from "../../../lib/comms";

/**
 * Consentimiento de comunicaciones comerciales (Fase MK-A, docs/fases/faseMK-marketing.md).
 * Una fila por cada vez que el cliente activa un tema; quitarlo la cierra (`revoked_at`), no la
 * borra: queda la prueba de qué aceptó, cuándo, desde dónde y con qué texto (`text_version`,
 * RGPD art. 7.1). Activo = `revoked_at` nulo (como mucho uno por cliente y tema).
 * Se borran todas al borrar el cliente (subscriber `comms-customer-deleted`).
 */
export const CommsConsent = model
  .define("comms_consent", {
    id: model.id({ prefix: "cmc" }).primaryKey(),
    customer_id: model.text(),
    topic: model.enum([...COMMS_TOPIC_IDS]),
    granted_at: model.dateTime(),
    /** Desde dónde se activó: hoy solo la cuenta. */
    source: model.enum(["cuenta", "admin"]).default("cuenta"),
    text_version: model.number(),
    revoked_at: model.dateTime().nullable(),
    /** Cómo se quitó: desde la cuenta o con el enlace de baja del email. */
    revoked_via: model.enum(["cuenta", "baja", "admin"]).nullable(),
  })
  .indexes([
    { on: ["customer_id"], where: "deleted_at IS NULL" },
    {
      on: ["customer_id", "topic"],
      unique: true,
      where: "deleted_at IS NULL AND revoked_at IS NULL",
    },
    { on: ["topic"], where: "deleted_at IS NULL AND revoked_at IS NULL" },
  ]);
