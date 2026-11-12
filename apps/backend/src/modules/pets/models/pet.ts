import { model } from "@medusajs/framework/utils";
import {
  PET_ORIGINS,
  PET_SEX,
  PET_SHOWCASE_STATUS,
  PET_SPECIES,
  PET_STATUS,
  PET_YES_NO,
} from "../../../lib/pets";

/**
 * Mascota de un cliente (Fase M, docs/fases/faseM-mascotas.md). Un cliente tiene las que quiera
 * (tope `PET_MAX_PER_CUSTOMER`); el enlace con el cliente es de solo lectura (`customer_id`,
 * src/links/pet-customer.ts), como la lista de deseos.
 * - Fechas como año + mes + día opcional (nacimiento aproximado; fallecimiento).
 * - `health` solo con `health_consent_at` (consentimiento); la foto, pública, con
 *   `photo_consent_at` (bucket público: `photo_url` + `photo_file_id` del módulo File).
 * - `status` y `share_token`: preparados para compartir fichas (protectoras), sin uso aún.
 * - Escaparate «Vuestros peques» (Fase MK-D): `showcase_consent_at` (casilla propia, distinta de
 *   la de la foto) y moderación (`showcase_status`: pendiente → aprobada | rechazada). Cambiar la
 *   foto vuelve a `pendiente`; quitar la casilla o la foto la saca del escaparate.
 */
export const Pet = model
  .define("pet", {
    id: model.id({ prefix: "pet" }).primaryKey(),
    customer_id: model.text(),
    name: model.text(),
    species: model.enum([...PET_SPECIES]),
    species_other: model.text().nullable(),
    breed: model.text().nullable(),
    birth_year: model.number().nullable(),
    birth_month: model.number().nullable(),
    birth_day: model.number().nullable(),
    death_year: model.number().nullable(),
    death_month: model.number().nullable(),
    death_day: model.number().nullable(),
    sex: model.enum([...PET_SEX]).nullable(),
    neutered: model.enum([...PET_YES_NO]).nullable(),
    weight_kg: model.float().nullable(),
    diet: model.text().nullable(),
    origin: model.enum([...PET_ORIGINS]).nullable(),
    health: model.text().nullable(),
    health_consent_at: model.dateTime().nullable(),
    photo_url: model.text().nullable(),
    photo_file_id: model.text().nullable(),
    photo_consent_at: model.dateTime().nullable(),
    status: model.enum([...PET_STATUS]).default("casa"),
    showcase_consent_at: model.dateTime().nullable(),
    showcase_status: model.enum([...PET_SHOWCASE_STATUS]).nullable(),
    showcase_reviewed_at: model.dateTime().nullable(),
    share_token: model.text().nullable(),
    metadata: model.json().nullable(),
  })
  .indexes([
    { on: ["customer_id"], where: "deleted_at IS NULL" },
    { on: ["showcase_status"], where: "deleted_at IS NULL AND showcase_consent_at IS NOT NULL" },
    { on: ["share_token"], unique: true, where: "deleted_at IS NULL AND share_token IS NOT NULL" },
  ]);
