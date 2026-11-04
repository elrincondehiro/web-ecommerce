import type { MedusaContainer } from "@medusajs/framework/types";
import { MedusaError } from "@medusajs/framework/utils";
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import {
  beginOrderEditOrderWorkflow,
  cancelBeginOrderEditWorkflow,
  confirmOrderEditRequestWorkflow,
  orderEditAddNewItemWorkflow,
  orderEditUpdateItemQuantityWorkflow,
} from "@medusajs/medusa/core-flows";
import {
  CAJA_DE,
  CAJA_EDITABLE,
  CAJA_MESSAGES,
  checkContent,
  type ContentLine,
} from "../../lib/caja";
import { candidateVariants, orderCajaContext } from "../../lib/caja-data";
import { isCajaLine } from "../../lib/line-data";
import { CAJA_MODULE } from "../../modules/caja";
import type CajaModuleService from "../../modules/caja/service";

/**
 * Rellenar una caja de snacks (Fase CS-3, docs/fases/faseCS-caja-snacks.md). Una **edición de
 * pedido** de Medusa (core-flows 2.22.2; spike en integration-tests/http/caja.spec.ts):
 *   1. valida (pago capturado, caja editable, sin otra edición abierta, contenido de snacks y
 *      PVP ≥ lo pagado);
 *   2. abre la edición, deja a 0 el contenido anterior de esa caja, añade el nuevo a 0 €
 *      (`unit_price: 0`, `allow_backorder`: la caja se prepara mirando el stock físico) con
 *      `metadata.caja_de = <línea de la caja>` y confirma (Medusa reserva el stock);
 *   3. marca la caja `rellena` (+1 intento).
 * Si algo falla después de abrir la edición, la compensación la cancela (deleteOrderChanges del
 * paso `create-order-change`); tras confirmarla no hay vuelta atrás (Medusa no deshace una edición
 * confirmada), por eso el paso de la caja va al final y solo escribe una fila.
 * Fuentes: context7 /medusajs/medusa (order edit, nested workflows `runAsStep` y compensación).
 */

export interface FillCajaInput {
  order_id: string;
  /** Línea de la caja. */
  line_item_id: string;
  items: ContentLine[];
  /** Usuario del Admin (created_by / confirmed_by de la edición). */
  actor_id: string;
}

const cajas = (c: unknown) => (c as MedusaContainer).resolve<CajaModuleService>(CAJA_MODULE);
const fail = (message: string, type = MedusaError.Types.NOT_ALLOWED) => {
  throw new MedusaError(type, message);
};

/** Valida y prepara: qué líneas viejas de esa caja dejar a 0 y el PVP del contenido nuevo. */
export const validateFillCajaStep = createStep(
  "validate-fill-caja",
  async (input: FillCajaInput, { container }) => {
    const ctx = await orderCajaContext(container as MedusaContainer, input.order_id);
    if (!ctx) return fail("Pedido no encontrado.", MedusaError.Types.NOT_FOUND);
    if (ctx.status === "canceled") fail(CAJA_MESSAGES.canceled);
    const line = ctx.items.find((i) => i.id === input.line_item_id);
    if (!line || !isCajaLine(line.metadata) || line.quantity <= 0) {
      return fail(
        "Esa línea no es una caja de snacks de este pedido.",
        MedusaError.Types.NOT_FOUND,
      );
    }
    const [row] = await cajas(container).listCajas({ line_item_id: line.id });
    if (row && !CAJA_EDITABLE.includes(row.estado)) fail(CAJA_MESSAGES.notEditable);
    if (ctx.pending > 0.005) fail(CAJA_MESSAGES.notCaptured);
    if (ctx.pendingChange) fail(CAJA_MESSAGES.pendingEdit);
    const variants = await candidateVariants(
      container as MedusaContainer,
      input.items.map((i) => i.variant_id),
      ctx.region_id,
      ctx.currency_code,
    );
    const check = checkContent(input.items, variants, line.unit_price);
    if (!check.ok) return fail(check.message, MedusaError.Types.INVALID_DATA);
    const previous = ctx.items
      .filter((i) => i.metadata?.[CAJA_DE] === line.id && i.quantity > 0)
      .map((i) => ({ id: i.id, quantity: 0 }));
    // `lines`: cantidades de Medusa (gramos → pasos en el granel)
    return new StepResponse({ previous, pvp: check.pvp, lines: check.lines });
  },
);

type CajaUndo = { created?: string; before?: Record<string, unknown> };

/** Marca la caja `rellena` (+1 intento) o la crea si no existía. Compensación: lo deja como estaba. */
export const markCajaFilledStep = createStep(
  "mark-caja-filled",
  async (
    input: { order_id: string; line_item_id: string; pvp: number },
    { container },
  ): Promise<StepResponse<{ id: string }, CajaUndo>> => {
    const service = cajas(container);
    const [row] = await service.listCajas({ line_item_id: input.line_item_id });
    const now = new Date();
    if (!row) {
      const created = await service.createCajas({
        order_id: input.order_id,
        line_item_id: input.line_item_id,
        estado: "rellena",
        intento: 1,
        rellenada_at: now,
        metadata: { pvp: input.pvp },
      });
      return new StepResponse({ id: created.id }, { created: created.id });
    }
    const before = {
      id: row.id,
      estado: row.estado,
      intento: row.intento,
      rellenada_at: row.rellenada_at,
      metadata: row.metadata,
    };
    const updated = await service.updateCajas({
      id: row.id,
      estado: "rellena",
      intento: row.intento + 1,
      rellenada_at: now,
      metadata: { ...(row.metadata ?? {}), pvp: input.pvp },
    });
    return new StepResponse({ id: updated.id }, { before });
  },
  async (undo, { container }) => {
    if (!undo) return;
    const service = cajas(container);
    if (undo.created) await service.deleteCajas(undo.created);
    if (undo.before) await service.updateCajas(undo.before as never);
  },
);

/**
 * Si el workflow falla con la edición abierta (antes de confirmar), la cancela. Va justo después
 * de abrirla: su compensación corre cuando falla un paso posterior.
 */
export const cancelEditOnFailureStep = createStep(
  "caja-cancel-edit-on-failure",
  async (input: { order_id: string }) => new StepResponse(null, input.order_id),
  async (orderId, { container }) => {
    if (!orderId) return;
    await cancelBeginOrderEditWorkflow(container as MedusaContainer)
      .run({ input: { order_id: orderId } })
      .catch(() => undefined); // ya confirmada o ya cancelada: nada que hacer
  },
);

export const fillCajaWorkflow = createWorkflow("fill-caja", (input: FillCajaInput) => {
  const prepared = validateFillCajaStep(input);
  beginOrderEditOrderWorkflow.runAsStep({
    input: transform({ input }, ({ input }) => ({
      order_id: input.order_id,
      created_by: input.actor_id,
      description: "Caja de snacks: contenido",
      internal_note: `caja ${input.line_item_id}`,
    })),
  });
  cancelEditOnFailureStep({ order_id: input.order_id });
  // Rehacer: el contenido anterior de ESTA caja a 0 (las otras cajas del pedido no se tocan)
  when({ prepared }, ({ prepared }) => prepared.previous.length > 0).then(() => {
    orderEditUpdateItemQuantityWorkflow
      .runAsStep({
        input: transform({ input, prepared }, ({ input, prepared }) => ({
          order_id: input.order_id,
          items: prepared.previous,
        })),
      })
      .config({ name: "caja-remove-previous" });
  });
  orderEditAddNewItemWorkflow.runAsStep({
    input: transform({ input, prepared }, ({ input, prepared }) => ({
      order_id: input.order_id,
      items: prepared.lines.map((i) => ({
        variant_id: i.variant_id,
        quantity: i.quantity,
        unit_price: 0,
        // La caja se prepara mirando el stock físico: si la web dice 0 es un desfase (decisión
        // del usuario). Solo en estas líneas; la variante sigue sin admitir reservas en la web.
        allow_backorder: true,
        metadata: { [CAJA_DE]: input.line_item_id },
      })),
    })),
  });
  confirmOrderEditRequestWorkflow.runAsStep({
    input: transform({ input }, ({ input }) => ({
      order_id: input.order_id,
      confirmed_by: input.actor_id,
    })),
  });
  const caja = markCajaFilledStep(
    transform({ input, prepared }, ({ input, prepared }) => ({
      order_id: input.order_id,
      line_item_id: input.line_item_id,
      pvp: prepared.pvp,
    })),
  );
  return new WorkflowResponse(caja);
});
