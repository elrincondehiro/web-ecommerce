import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { consentPlan } from "../../lib/comms-plan";
import type { CommsTopicId } from "../../lib/comms";
import { COMMS_MODULE } from "../../modules/comms";
import type CommsModuleService from "../../modules/comms/service";

/**
 * Pasos de los consentimientos (Fase MK-A). Patrón de la guía oficial `wishlist` (context7
 * /medusajs/medusa): cada paso que escribe tiene compensación.
 */
const service = (c: { resolve: <T>(k: string) => T }) =>
  c.resolve<CommsModuleService>(COMMS_MODULE);

type Via = "cuenta" | "baja" | "admin";

/**
 * Deja al cliente con los temas `topics` activos: abre los nuevos y cierra los que ya no quiere.
 * Con `only` solo toca esos temas (la baja de un email quita uno sin mirar el resto).
 * Compensación: borrar lo abierto y reabrir lo cerrado.
 */
export const setConsentsStep = createStep(
  "set-comms-consents",
  async (
    input: { customer_id: string; topics: CommsTopicId[]; only?: CommsTopicId[]; via: Via },
    { container },
  ) => {
    const svc = service(container);
    const active = await svc.listCommsConsents({
      customer_id: input.customer_id,
      revoked_at: null,
      ...(input.only ? { topic: input.only } : {}),
    });
    const plan = consentPlan(active, input.topics);
    const now = new Date();
    const created = plan.grant.length
      ? await svc.createCommsConsents(
          plan.grant.map((g) => ({
            customer_id: input.customer_id,
            topic: g.topic,
            text_version: g.text_version,
            granted_at: now,
            source: input.via === "admin" ? ("admin" as const) : ("cuenta" as const),
          })),
        )
      : [];
    if (plan.revoke.length) {
      await svc.updateCommsConsents(
        plan.revoke.map((id) => ({ id, revoked_at: now, revoked_via: input.via })),
      );
    }
    return new StepResponse(
      { granted: plan.grant.map((g) => g.topic), revoked: plan.revoke.length },
      { created: created.map((c) => c.id), revoked: plan.revoke },
    );
  },
  async (comp, { container }) => {
    if (!comp) return;
    const svc = service(container);
    if (comp.created.length) await svc.deleteCommsConsents(comp.created);
    if (comp.revoked.length) {
      await svc.updateCommsConsents(
        comp.revoked.map((id) => ({ id, revoked_at: null, revoked_via: null })),
      );
    }
  },
);

/** Borra (suave) todos los consentimientos del cliente: baja de la cuenta. */
export const deleteConsentsStep = createStep(
  "delete-comms-consents",
  async (input: { customer_id: string }, { container }) => {
    const svc = service(container);
    const rows = await svc.listCommsConsents({ customer_id: input.customer_id });
    const ids = rows.map((r) => r.id);
    if (ids.length) await svc.softDeleteCommsConsents(ids);
    return new StepResponse(ids.length, ids);
  },
  async (ids, { container }) => {
    if (ids?.length) await service(container).restoreCommsConsents(ids);
  },
);
