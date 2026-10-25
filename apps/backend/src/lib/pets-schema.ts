import { z } from "@medusajs/framework/zod";
import { PET_ORIGINS, PET_SEX, PET_SPECIES, PET_YES_NO, type PetFields } from "./pets";

/**
 * Cuerpo de crear/editar una mascota (Fase M), común a la Store API y al Admin. JSON; los campos
 * opcionales vacíos llegan como `null` (o no llegan). Las reglas que cruzan campos (fechas,
 * consentimiento) van en `petFieldsErrors` (src/lib/pets.ts), dentro del workflow.
 */
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const int = (min: number, max: number) => z.number().int().min(min).max(max).nullish();

export const PetBody = z.object({
  name: z.string().trim().min(1).max(60),
  species: z.enum(PET_SPECIES),
  species_other: text(40),
  breed: text(120),
  birth_year: int(1900, 2100),
  birth_month: int(1, 12),
  birth_day: int(1, 31),
  death_year: int(1900, 2100),
  death_month: int(1, 12),
  death_day: int(1, 31),
  sex: z.enum(PET_SEX).nullish(),
  neutered: z.enum(PET_YES_NO).nullish(),
  weight_kg: z.number().positive().max(200).nullish(),
  diet: text(200),
  origin: z.enum(PET_ORIGINS).nullish(),
  health: text(500),
  health_consent: z.boolean().default(false),
});
export type PetBodyInput = z.infer<typeof PetBody>;

/** `undefined` → `null` (lo que guarda el modelo). */
export function toPetFields(b: PetBodyInput): PetFields {
  return {
    name: b.name,
    species: b.species,
    species_other: b.species_other ?? null,
    breed: b.breed ?? null,
    birth_year: b.birth_year ?? null,
    birth_month: b.birth_month ?? null,
    birth_day: b.birth_day ?? null,
    death_year: b.death_year ?? null,
    death_month: b.death_month ?? null,
    death_day: b.death_day ?? null,
    sex: b.sex ?? null,
    neutered: b.neutered ?? null,
    weight_kg: b.weight_kg == null ? null : Math.round(b.weight_kg * 10) / 10,
    diet: b.diet ?? null,
    origin: b.origin ?? null,
    health: b.health ?? null,
    health_consent: b.health_consent,
  };
}

/**
 * Foto (Fase M): WebP de ≤ 800 px ya reducido y sin metadatos (lo hace el storefront con sharp o
 * el Admin con canvas), en base64. `consent` = la foto puede ser pública (bucket público).
 */
export const PetPhotoBody = z.object({
  content: z
    .string()
    .min(16)
    .max(820_000)
    .regex(/^[A-Za-z0-9+/]+=*$/),
  consent: z.literal(true),
});
