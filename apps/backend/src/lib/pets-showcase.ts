import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { goneLabel, petAgeLabel, type PetShowcaseStatus } from "./pets";
import { PETS_MODULE } from "../modules/pets";
import type PetsModuleService from "../modules/pets/service";

/**
 * Escaparate «Vuestros peques» (Fase MK-D). Lo público es SOLO nombre, foto y edad en texto (las
 * fallecidas, «Hiro · 2009–2023»): nunca el dueño, la raza, la salud ni el id. Solo con la casilla
 * del escaparate, foto y aprobada en el Admin.
 * Cuántas: hasta `SHOWCASE_MAX` (las más recientes de cada grupo); la página las baraja.
 */
export const SHOWCASE_MAX = 120;

type Row = {
  id: string;
  name: string;
  photo_url: string | null;
  birth_year: number | null;
  birth_month: number | null;
  birth_day: number | null;
  death_year: number | null;
  death_month: number | null;
  death_day: number | null;
  showcase_status: PetShowcaseStatus | null;
  showcase_consent_at: Date | null;
  showcase_reviewed_at: Date | null;
  updated_at: Date;
  customer_id: string;
};

const svc = (c: MedusaContainer) => c.resolve<PetsModuleService>(PETS_MODULE);

export type ShowcaseCard = { name: string; photo: string; label: string | null };

export function showcaseCard(p: Row, today = new Date()): ShowcaseCard {
  const birth = { year: p.birth_year, month: p.birth_month, day: p.birth_day };
  if (p.death_year != null) {
    return {
      name: p.name,
      photo: p.photo_url!,
      label: goneLabel(p.name, p.birth_year, p.death_year),
    };
  }
  return { name: p.name, photo: p.photo_url!, label: petAgeLabel(birth, null, today) };
}

/** Público (GET /store/showcase): vivas y fallecidas aprobadas, las más recientes primero. */
export async function publicShowcase(container: MedusaContainer) {
  const rows = (await svc(container).listPets(
    { showcase_status: "aprobada", showcase_consent_at: { $ne: null }, photo_url: { $ne: null } },
    { order: { showcase_reviewed_at: "DESC" }, take: SHOWCASE_MAX * 2 },
  )) as unknown as Row[];
  const alive = rows.filter((r) => r.death_year == null).slice(0, SHOWCASE_MAX);
  const gone = rows.filter((r) => r.death_year != null).slice(0, SHOWCASE_MAX);
  return { alive: alive.map((r) => showcaseCard(r)), gone: gone.map((r) => showcaseCard(r)) };
}

/** Admin (moderación): por estado, con el email del dueño para poder contactar si hace falta. */
export async function adminShowcase(container: MedusaContainer, status: PetShowcaseStatus) {
  const rows = (await svc(container).listPets(
    { showcase_status: status, showcase_consent_at: { $ne: null }, photo_url: { $ne: null } },
    { order: { updated_at: "ASC" }, take: 200 },
  )) as unknown as Row[];
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const ids = [...new Set(rows.map((r) => r.customer_id))];
  const { data: customers } = ids.length
    ? await query.graph({ entity: "customer", fields: ["id", "email"], filters: { id: ids } })
    : { data: [] };
  const email = new Map((customers as { id: string; email: string }[]).map((c) => [c.id, c.email]));
  return rows.map((r) => ({
    id: r.id,
    ...showcaseCard(r),
    status: r.showcase_status,
    customer_id: r.customer_id,
    customer_email: email.get(r.customer_id) ?? null,
    updated_at: r.updated_at,
  }));
}
