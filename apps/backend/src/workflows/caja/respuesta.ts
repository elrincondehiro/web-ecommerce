import type { MedusaContainer } from "@medusajs/framework/types";
import { MedusaError } from "@medusajs/framework/utils";
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { emitEventStep } from "@medusajs/medusa/core-flows";
import {
  CAJA_ACEPTADA,
  CAJA_MESSAGES,
  CAJA_MOTIVO_MAX,
  CAJA_PROPONIBLE,
  type CajaEstado,
} from "../../lib/caja";
import { hashCajaToken, newCajaToken, tokenMatches } from "../../lib/caja-time";
import { CAJA_MODULE } from "../../modules/caja";
import type CajaModuleService from "../../modules/caja/service";

/**
 * Propuesta de la caja de snacks al cliente (Fase CS-4, docs/fases/faseCS-caja-snacks.md):
 * - `propose-cajas` (Admin): todas las cajas del pedido preparadas → `propuesta` con un token
 *   nuevo por caja (en la base, solo su hash) y evento `caja.propuesta` con los tokens EN CLARO
 *   para el email (el subscriber los usa y no los registra). Un email con todas.
 * - `answer-caja` (cliente, con el token del enlace): `aceptada` o `rechazada` (+ motivo). El
 *   token deja de valer. Evento `caja.respondida`.
 * - `auto-accept-caja` (job): `propuesta` vencida → `aceptada_auto`. Evento `caja.respondida`.
 * Cada paso que escribe tiene compensación (deja la fila como estaba). Los emails y los avisos los
 * mandan los subscribers de esos eventos.
 */

export const CAJA_EVENTS = {
  proposed: "caja.propuesta",
  answered: "caja.respondida",
  alert: "caja.aviso",
} as const;

const cajas = (c: unknown) => (c as MedusaContainer).resolve<CajaModuleService>(CAJA_MODULE);

type Row = Awaited<ReturnType<CajaModuleService["listCajas"]>>[number];
const snapshot = (r: Row) => ({
  id: r.id,
  estado: r.estado,
  token_hash: r.token_hash,
  propuesta_at: r.propuesta_at,
  respondida_at: r.respondida_at,
  motivo_rechazo: r.motivo_rechazo,
  aviso_at: r.aviso_at,
});

/** Restaura las filas como estaban (compensación común). */
const restore = async (before: ReturnType<typeof snapshot>[] | undefined, container: unknown) => {
  if (!before?.length) return;
  await cajas(container).updateCajas(before as never);
};

// ── Proponer ───────────────────────────────────────────────────────────────

export const proposeCajasStep = createStep(
  "propose-cajas",
  async (input: { order_id: string; line_item_ids: string[] }, { container }) => {
    const service = cajas(container);
    const rows = await service.listCajas({ order_id: input.order_id });
    const byLine = new Map(rows.map((r) => [r.line_item_id, r]));
    // Todas las cajas del pedido tienen que tener fila y estar preparadas o ya resueltas
    const missing = input.line_item_ids.some((id) => !byLine.has(id));
    const open = rows.filter((r) => ["pendiente", "rechazada"].includes(r.estado));
    if (missing || open.length) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, CAJA_MESSAGES.notProposable);
    }
    // En el orden de las líneas del pedido (el del email)
    const order = new Map(input.line_item_ids.map((id, i) => [id, i]));
    const toPropose = rows
      .filter((r) => CAJA_PROPONIBLE.includes(r.estado))
      .sort((a, b) => (order.get(a.line_item_id) ?? 0) - (order.get(b.line_item_id) ?? 0));
    if (!toPropose.length) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, CAJA_MESSAGES.nothingToPropose);
    }
    const now = new Date();
    const tokens = toPropose.map((r) => ({ line_item_id: r.line_item_id, token: newCajaToken() }));
    await service.updateCajas(
      toPropose.map((r, i) => ({
        id: r.id,
        estado: "propuesta" as CajaEstado,
        token_hash: hashCajaToken(tokens[i]!.token),
        propuesta_at: now,
        respondida_at: null,
        motivo_rechazo: null,
      })),
    );
    return new StepResponse(
      { order_id: input.order_id, tokens, proposed_at: now.toISOString() },
      toPropose.map(snapshot),
    );
  },
  restore,
);

export const proposeCajasWorkflow = createWorkflow(
  "propose-cajas",
  (input: { order_id: string; line_item_ids: string[] }) => {
    const proposed = proposeCajasStep(input);
    emitEventStep({
      eventName: CAJA_EVENTS.proposed,
      data: transform({ proposed }, ({ proposed }) => proposed),
    });
    return new WorkflowResponse(
      transform({ proposed }, ({ proposed }) => ({
        order_id: proposed.order_id,
        count: proposed.tokens.length,
      })),
    );
  },
);

// ── Responder (cliente) ────────────────────────────────────────────────────

export type CajaAnswer = "aceptada" | "rechazada";

export const answerCajaStep = createStep(
  "answer-caja",
  async (
    input: { line_item_id: string; token: string; answer: CajaAnswer; motivo?: string | null },
    { container },
  ) => {
    const service = cajas(container);
    const [row] = await service.listCajas({ line_item_id: input.line_item_id });
    // Sin la caja, sin el token correcto o ya respondida: lo mismo (404), sin pistas
    if (!row || row.estado !== "propuesta" || !tokenMatches(input.token, row.token_hash)) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Enlace no válido o ya respondido.");
    }
    const motivo = (input.motivo ?? "").trim();
    if (input.answer === "rechazada" && (!motivo || [...motivo].length > CAJA_MOTIVO_MAX)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Cuéntanos qué no le gusta (hasta ${CAJA_MOTIVO_MAX} caracteres).`,
      );
    }
    const now = new Date();
    await service.updateCajas({
      id: row.id,
      estado: input.answer,
      token_hash: null,
      respondida_at: now,
      motivo_rechazo: input.answer === "rechazada" ? motivo : null,
      // Rechazada: vuelve a contar el plazo del aviso interno desde ahora
      aviso_at: input.answer === "rechazada" ? null : row.aviso_at,
    });
    return new StepResponse(
      {
        order_id: row.order_id,
        line_item_id: row.line_item_id,
        estado: input.answer as CajaEstado,
        auto: false,
      },
      [snapshot(row)],
    );
  },
  restore,
);

export const answerCajaWorkflow = createWorkflow(
  "answer-caja",
  (input: { line_item_id: string; token: string; answer: CajaAnswer; motivo?: string | null }) => {
    const answered = answerCajaStep(input);
    emitEventStep({
      eventName: CAJA_EVENTS.answered,
      data: transform({ answered }, ({ answered }) => answered),
    });
    return new WorkflowResponse(answered);
  },
);

// ── Aceptación automática (job) ────────────────────────────────────────────

export const autoAcceptCajaStep = createStep(
  "auto-accept-caja",
  async (input: { id: string; before: Date }, { container }) => {
    const service = cajas(container);
    const [row] = await service.listCajas({ id: input.id });
    // Ya respondida (o propuesta otra vez después): nada
    if (
      !row ||
      row.estado !== "propuesta" ||
      !row.propuesta_at ||
      new Date(row.propuesta_at) > input.before
    ) {
      return new StepResponse(null, [] as ReturnType<typeof snapshot>[]);
    }
    await service.updateCajas({
      id: row.id,
      estado: "aceptada_auto",
      token_hash: null,
      respondida_at: new Date(),
    });
    return new StepResponse(
      {
        order_id: row.order_id,
        line_item_id: row.line_item_id,
        estado: "aceptada_auto" as CajaEstado,
        auto: true,
      },
      [snapshot(row)],
    );
  },
  restore,
);

export const autoAcceptCajaWorkflow = createWorkflow(
  "auto-accept-caja",
  (input: { id: string; before: Date }) => {
    const accepted = autoAcceptCajaStep(input);
    emitEventStep({
      eventName: CAJA_EVENTS.answered,
      data: transform({ accepted }, ({ accepted }) => accepted ?? []),
    });
    return new WorkflowResponse(accepted);
  },
);

/** ¿Quedan cajas sin aceptar en el pedido? (para el aviso «listo para enviar»). */
export async function allAccepted(container: MedusaContainer, orderId: string): Promise<boolean> {
  const rows = await cajas(container).listCajas({ order_id: orderId });
  return rows.length > 0 && rows.every((r) => CAJA_ACEPTADA.includes(r.estado));
}
