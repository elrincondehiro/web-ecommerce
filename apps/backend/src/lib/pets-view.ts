import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { PETS_MODULE } from "../modules/pets";
import type PetsModuleService from "../modules/pets/service";

/**
 * Lo que se devuelve de una mascota (Fase M), al cliente y al Admin. Sin `photo_file_id`,
 * `share_token` ni `metadata` (internos).
 */
export const PET_FIELDS = [
  "id",
  "name",
  "species",
  "species_other",
  "breed",
  "birth_year",
  "birth_month",
  "birth_day",
  "death_year",
  "death_month",
  "death_day",
  "sex",
  "neutered",
  "weight_kg",
  "diet",
  "origin",
  "health",
  "health_consent_at",
  "photo_url",
  "photo_consent_at",
  "status",
  "created_at",
  "updated_at",
] as const;

export function petView<T extends Record<string, unknown>>(pet: T) {
  return Object.fromEntries(PET_FIELDS.map((k) => [k, pet[k] ?? null]));
}

/** 404 si el cliente no existe (el Admin crea mascotas por el id de la URL). */
export async function assertCustomer(container: MedusaContainer, customerId: string) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "customer",
    fields: ["id"],
    filters: { id: customerId },
  });
  if (!data[0]) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Cliente no encontrado");
}

/** Mascotas del cliente: vivas primero (por alta), después las fallecidas. */
export async function listCustomerPets(container: MedusaContainer, customerId: string) {
  const pets = await container
    .resolve<PetsModuleService>(PETS_MODULE)
    .listPets({ customer_id: customerId }, { order: { created_at: "ASC" }, take: 100 });
  const alive = pets.filter((p) => p.death_year == null);
  const gone = pets.filter((p) => p.death_year != null);
  return [...alive, ...gone].map((p) => petView(p as unknown as Record<string, unknown>));
}
