import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { PetBirthdayItem } from "emails";
import { birthdayAge, isBirthdayToday, madridToday } from "./pets";
import { PETS_MODULE } from "../modules/pets";
import type PetsModuleService from "../modules/pets/service";
import { hashKey, linksFrom, sendMarketingEmail } from "../subscribers/_email";

/**
 * Cumpleaños de las mascotas (Fase MK-D), job diario `pets-birthday` (worker, `PETS_BIRTHDAY_CRON`,
 * 9:00 UTC por defecto). Fecha de Madrid. Un email por cliente con todas las que cumplen hoy (o
 * este mes, si solo se sabe el mes: el día 1), SOLO con el tema «cumpleanos» activado
 * (`sendMarketingEmail` lo comprueba y añade la baja). Clave de idempotencia por mascota y año:
 * si el job se repite, no se envía dos veces.
 */
export const PETS_BIRTHDAY_DEFAULT_CRON = "0 9 * * *";

type Row = {
  id: string;
  customer_id: string;
  name: string;
  photo_url: string | null;
  birth_year: number | null;
  birth_month: number | null;
  birth_day: number | null;
  death_year: number | null;
};

export async function sendPetBirthdays(container: MedusaContainer, now = new Date()) {
  const today = madridToday(now);
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const rows = (await container.resolve<PetsModuleService>(PETS_MODULE).listPets(
    { birth_month: today.month, death_year: null },
    {
      select: [
        "id",
        "customer_id",
        "name",
        "photo_url",
        "birth_year",
        "birth_month",
        "birth_day",
        "death_year",
      ],
    },
  )) as unknown as Row[];
  const due = rows.filter((p) => isBirthdayToday(p, today));
  if (!due.length) return { pets: 0, sent: 0 };

  const byCustomer = new Map<string, Row[]>();
  for (const p of due) byCustomer.set(p.customer_id, [...(byCustomer.get(p.customer_id) ?? []), p]);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "customer",
    fields: ["id", "email", "has_account"],
    filters: { id: [...byCustomer.keys()] },
  });
  const links = linksFrom(container);
  let sent = 0;
  for (const c of data as { id: string; email: string; has_account: boolean }[]) {
    if (!c.has_account || !c.email) continue;
    const pets = byCustomer.get(c.id)!;
    const items: PetBirthdayItem[] = pets.map((p) => ({
      name: p.name,
      age: birthdayAge(p.birth_year!, today.year),
      photo: p.photo_url?.startsWith("http") ? p.photo_url : null,
      thisMonth: p.birth_day == null,
    }));
    const ok = await sendMarketingEmail(container, {
      customerId: c.id,
      topic: "cumpleanos",
      to: c.email,
      template: "pet-birthday",
      data: { ...links, pets: items, petsUrl: `${links.storefrontUrl}/cuenta/mascotas/` },
      idempotencyKey: hashKey(
        `pet-birthday/${today.year}`,
        pets
          .map((p) => p.id)
          .sort()
          .join(","),
      ),
    });
    if (ok) sent += 1;
  }
  if (sent) logger.info(`[pets-birthday] ${sent} felicitaciones (${due.length} peques).`);
  return { pets: due.length, sent };
}
