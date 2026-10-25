import { MedusaError } from "@medusajs/framework/utils";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { PET_MAX_PER_CUSTOMER, petFieldsErrors, petRecord, type PetFields } from "../../lib/pets";
import { PETS_MODULE } from "../../modules/pets";
import type PetsModuleService from "../../modules/pets/service";

/**
 * Pasos de las mascotas (Fase M). Cada paso que escribe tiene compensación (patrón de la guía
 * oficial `wishlist`, context7 /medusajs/medusa). Toda operación va por `customer_id` + `id`: una
 * mascota de otro cliente se trata como inexistente (404, no se distingue).
 */

type PetRow = Awaited<ReturnType<PetsModuleService["retrievePet"]>>;

const service = (c: { resolve: <T>(k: string) => T }) => c.resolve<PetsModuleService>(PETS_MODULE);

/** Lo que se puede restaurar al compensar una edición. */
const EDITABLE = [
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
  "photo_file_id",
  "photo_consent_at",
] as const;
const snapshot = (pet: PetRow) =>
  Object.fromEntries(EDITABLE.map((k) => [k, pet[k as keyof PetRow]])) as Record<string, unknown>;

function assertValid(fields: PetFields) {
  const errors = petFieldsErrors(fields);
  const first = Object.entries(errors)[0];
  if (first) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `${first[0]}: ${first[1]}`);
  }
}

/** La mascota del cliente (404 si no existe o es de otro). */
export const findCustomerPetStep = createStep(
  "find-customer-pet",
  async (input: { customer_id: string; pet_id: string }, { container }) => {
    const [pet] = await service(container).listPets({
      id: input.pet_id,
      customer_id: input.customer_id,
    });
    if (!pet) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Mascota no encontrada");
    return new StepResponse(pet);
  },
);

/** Crea la mascota (tope por cliente). Compensación: borrarla. */
export const createPetStep = createStep(
  "create-pet",
  async (input: { customer_id: string; fields: PetFields }, { container }) => {
    assertValid(input.fields);
    const svc = service(container);
    const [, count] = await svc.listAndCountPets({ customer_id: input.customer_id });
    if (count >= PET_MAX_PER_CUSTOMER) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Como mucho ${PET_MAX_PER_CUSTOMER} mascotas por cuenta`,
      );
    }
    const pet = await svc.createPets({
      customer_id: input.customer_id,
      ...petRecord(input.fields, null),
    });
    return new StepResponse(pet, pet.id);
  },
  async (id, { container }) => {
    if (id) await service(container).deletePets(id);
  },
);

/** Edita los datos (no la foto). Compensación: volver a los datos anteriores. */
export const updatePetStep = createStep(
  "update-pet",
  async (input: { pet: PetRow; fields: PetFields }, { container }) => {
    assertValid(input.fields);
    const updated = await service(container).updatePets({
      id: input.pet.id,
      ...petRecord(input.fields, input.pet.health_consent_at ?? null),
    });
    return new StepResponse(updated, { id: input.pet.id, prev: snapshot(input.pet) });
  },
  async (prev, { container }) => {
    if (prev) await service(container).updatePets({ id: prev.id, ...prev.prev });
  },
);

/** Pone o quita la foto (consentimiento con fecha). Compensación: la foto anterior. */
export const setPetPhotoStep = createStep(
  "set-pet-photo",
  async (input: { pet: PetRow; photo: { url: string; file_id: string } | null }, { container }) => {
    const { pet, photo } = input;
    const updated = await service(container).updatePets({
      id: pet.id,
      photo_url: photo?.url ?? null,
      photo_file_id: photo?.file_id ?? null,
      photo_consent_at: photo ? new Date() : null,
    });
    return new StepResponse(updated, {
      id: pet.id,
      prev: {
        photo_url: pet.photo_url,
        photo_file_id: pet.photo_file_id,
        photo_consent_at: pet.photo_consent_at,
      },
    });
  },
  async (prev, { container }) => {
    if (prev) await service(container).updatePets({ id: prev.id, ...prev.prev });
  },
);

/** Borrado suave. Compensación: restaurar. Devuelve los ficheros de foto a borrar. */
export const softDeletePetsStep = createStep(
  "soft-delete-pets",
  async (input: { customer_id: string; pet_id?: string }, { container }) => {
    const svc = service(container);
    const pets = await svc.listPets({
      customer_id: input.customer_id,
      ...(input.pet_id ? { id: input.pet_id } : {}),
    });
    if (input.pet_id && !pets.length) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Mascota no encontrada");
    }
    const ids = pets.map((p) => p.id);
    if (ids.length) await svc.softDeletePets(ids);
    const fileIds = pets.map((p) => p.photo_file_id).filter((f): f is string => Boolean(f));
    return new StepResponse({ ids, fileIds }, ids);
  },
  async (ids, { container }) => {
    if (ids?.length) await service(container).restorePets(ids);
  },
);
