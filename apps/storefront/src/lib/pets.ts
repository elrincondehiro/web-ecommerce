// Mis peques (Fase M, docs/fases/faseM-mascotas.md): funciones PURAS (sin astro:* ni I/O) para
// Vitest. Las reglas se comprueban también en el backend (apps/backend/src/lib/pets.ts, que es la
// fuente de verdad); aquí se validan para dar los errores por campo del formulario sin JS.
import type { ParseResult } from "./account";

export const PET_SPECIES = {
  perro: "Perro",
  gato: "Gato",
  conejo: "Conejo",
  huron: "Hurón",
  roedor: "Roedor (hámster, cobaya…)",
  ave: "Ave",
  reptil: "Reptil",
  otro: "Otro",
} as const;
export const PET_SEX = { macho: "Macho", hembra: "Hembra", desconocido: "No lo sé" } as const;
export const PET_NEUTERED = { si: "Sí", no: "No", desconocido: "No lo sé" } as const;
export const PET_ORIGINS = {
  adoptado: "Adoptado (protectora)",
  rescatado: "Rescatado o encontrado",
  criador: "Criador",
  tienda: "Tienda",
  familia: "Familia o regalo",
  otro: "Otro",
} as const;
export const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

export const PET_MIN_YEAR = 1980;
/** Foto que se acepta subir (antes de reducirla a 800 px WebP en el servidor). */
export const PET_PHOTO_MAX_BYTES = 8 * 1024 * 1024;
export const PET_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;
export const PET_PHOTO_PX = 800;

export type PetSpecies = keyof typeof PET_SPECIES;

/** Mascota tal y como la devuelve el backend (`/store/customers/me/pets`). */
export interface Pet {
  id: string;
  name: string;
  species: PetSpecies;
  species_other: string | null;
  breed: string | null;
  birth_year: number | null;
  birth_month: number | null;
  birth_day: number | null;
  death_year: number | null;
  death_month: number | null;
  death_day: number | null;
  sex: keyof typeof PET_SEX | null;
  neutered: keyof typeof PET_NEUTERED | null;
  weight_kg: number | null;
  diet: string | null;
  origin: keyof typeof PET_ORIGINS | null;
  health: string | null;
  health_consent_at: string | null;
  photo_url: string | null;
  photo_consent_at: string | null;
}

/** Cuerpo de crear/editar del backend (`PetBody`). */
export type PetBody = Omit<Pet, "id" | "health_consent_at" | "photo_url" | "photo_consent_at"> & {
  health_consent: boolean;
};

export const PET_FORM_FIELDS = [
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
] as const;

type PartialDate = { year: number | null; month: number | null; day: number | null };

function compare(a: PartialDate, b: PartialDate): number {
  if (a.year == null || b.year == null) return 0;
  if (a.year !== b.year) return a.year - b.year;
  if (a.month == null || b.month == null) return 0;
  if (a.month !== b.month) return a.month - b.month;
  if (a.day == null || b.day == null) return 0;
  return a.day - b.day;
}

const todayOf = (d: Date): PartialDate => ({
  year: d.getFullYear(),
  month: d.getMonth() + 1,
  day: d.getDate(),
});

/** Motivo por el que una fecha parcial no vale (o null). Todo vacío = sin fecha. */
export function partialDateError(d: PartialDate, today = new Date()): string | null {
  const { year, month, day } = d;
  if (year == null && month == null && day == null) return null;
  if (year == null) return "Escribe el año.";
  if (day != null && month == null) return "Elige el mes (o deja el día vacío).";
  if (year < PET_MIN_YEAR) return "Escribe un año válido.";
  if (day != null) {
    const date = new Date(Date.UTC(year, month! - 1, day));
    if (date.getUTCMonth() !== month! - 1) return "Ese día no existe en ese mes.";
  }
  if (compare(d, todayOf(today)) > 0) return "La fecha no puede ser futura.";
  return null;
}

/** Edad aproximada («3 años y 2 meses»; sin mes, solo años); hasta el fallecimiento si lo hay. */
export function petAgeLabel(
  pet: Pick<Pet, `birth_${"year" | "month" | "day"}` | `death_${"year" | "month" | "day"}`>,
  today = new Date(),
): string | null {
  if (pet.birth_year == null) return null;
  const end =
    pet.death_year != null
      ? { year: pet.death_year, month: pet.death_month, day: pet.death_day }
      : todayOf(today);
  if (pet.birth_month == null || end.month == null) {
    const years = Math.max(0, end.year! - pet.birth_year);
    return years === 0 ? "menos de 1 año" : years === 1 ? "1 año" : `${years} años`;
  }
  let months = (end.year! - pet.birth_year) * 12 + (end.month - pet.birth_month);
  if (pet.birth_day != null && end.day != null && end.day < pet.birth_day) months -= 1;
  months = Math.max(0, months);
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const y = years === 1 ? "1 año" : `${years} años`;
  const m = rest === 1 ? "1 mes" : `${rest} meses`;
  if (years === 0) return rest === 0 ? "menos de 1 mes" : m;
  return rest === 0 ? y : `${y} y ${m}`;
}

/** «14 de marzo de 2021», «marzo de 2021», «2021». */
export function partialDateLabel(
  year: number | null,
  month: number | null,
  day: number | null,
): string | null {
  if (year == null) return null;
  if (month == null) return String(year);
  const m = `${MONTHS[month - 1]} de ${year}`;
  return day == null ? m : `${day} de ${m}`;
}

export const speciesLabel = (pet: Pick<Pet, "species" | "species_other">) =>
  pet.species === "otro" && pet.species_other ? pet.species_other : PET_SPECIES[pet.species];

export const isGone = (pet: Pick<Pet, "death_year">) => pet.death_year != null;

/** Valores del formulario a partir de la mascota guardada (para editar). */
export function petFormValues(pet: Pet): Record<string, string> {
  const v: Record<string, string> = {};
  for (const k of PET_FORM_FIELDS) {
    const raw = pet[k];
    v[k] = raw == null ? "" : k === "weight_kg" ? String(raw).replace(".", ",") : String(raw);
  }
  v.health_consent = pet.health_consent_at ? "on" : "";
  return v;
}

const get = (form: FormData, k: string) => {
  const v = form.get(k);
  return typeof v === "string" ? v.trim() : "";
};
// eslint-disable-next-line no-control-regex -- sin caracteres de control (salvo \n en textos largos)
const clean = (s: string) => s.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "");

/**
 * Formulario de mascota → cuerpo del backend o errores por campo. Reglas de los consentimientos:
 * con salud escrita y sin marcar la casilla NO se guarda nada (aviso en `health_consent`); igual
 * con la foto (`photo_consent`, se comprueba con `hasPhoto`).
 */
export function parsePetForm(
  form: FormData,
  opts: { hasPhoto: boolean; today?: Date } = { hasPhoto: false },
): ParseResult<PetBody> {
  const values: Record<string, string> = {};
  for (const k of PET_FORM_FIELDS) values[k] = clean(get(form, k)).slice(0, 500);
  values.health_consent = get(form, "health_consent") === "on" ? "on" : "";
  const errors: Record<string, string> = {};

  const name = values.name!;
  if (!name) errors.name = "Escribe su nombre.";
  else if (name.length > 60) errors.name = "Máximo 60 caracteres.";

  const species = values.species as PetSpecies;
  if (!(species in PET_SPECIES)) errors.species = "Elige qué animal es.";
  const speciesOther = values.species_other!;
  if (species === "otro" && !speciesOther) errors.species_other = "Indica qué animal es.";
  if (speciesOther.length > 40) errors.species_other = "Máximo 40 caracteres.";

  const max = (k: string, n: number) => {
    if ((values[k] ?? "").length > n) errors[k] = `Máximo ${n} caracteres.`;
  };
  max("breed", 120);
  max("diet", 200);
  max("health", 500);

  const int = (k: string, min: number, maxV: number, msg: string): number | null => {
    const raw = values[k]!;
    if (!raw) return null;
    const n = /^\d{1,4}$/.test(raw) ? Number(raw) : NaN;
    if (!(n >= min && n <= maxV)) {
      errors[k] = msg;
      return null;
    }
    return n;
  };
  const dateOf = (prefix: "birth" | "death") => ({
    year: int(`${prefix}_year`, 1000, 9999, "Escribe el año con 4 cifras."),
    month: int(`${prefix}_month`, 1, 12, "Elige el mes."),
    day: int(`${prefix}_day`, 1, 31, "Escribe un día del 1 al 31."),
  });
  const birth = dateOf("birth");
  const death = dateOf("death");
  const today = opts.today ?? new Date();
  for (const [prefix, d] of [
    ["birth", birth],
    ["death", death],
  ] as const) {
    if (errors[`${prefix}_year`] || errors[`${prefix}_month`] || errors[`${prefix}_day`]) continue;
    const e = partialDateError(d, today);
    if (e) errors[`${prefix}_year`] = e;
  }
  if (!errors.birth_year && !errors.death_year && death.year != null && compare(death, birth) < 0) {
    errors.death_year = "No puede ser anterior al nacimiento.";
  }

  const pick = <T extends object>(k: string, list: T): keyof T | null => {
    const raw = values[k]!;
    if (!raw) return null;
    if (!(raw in list)) {
      errors[k] = "Elige una opción de la lista.";
      return null;
    }
    return raw as keyof T;
  };
  const sex = pick("sex", PET_SEX);
  const neutered = pick("neutered", PET_NEUTERED);
  const origin = pick("origin", PET_ORIGINS);

  let weight: number | null = null;
  if (values.weight_kg) {
    const n = /^\d{1,3}([.,]\d{1,2})?$/.test(values.weight_kg)
      ? Number(values.weight_kg.replace(",", "."))
      : NaN;
    if (!(n > 0 && n <= 200)) errors.weight_kg = "Escribe el peso en kg (p. ej. 12,5).";
    else weight = Math.round(n * 10) / 10;
  }

  const health = values.health!;
  const healthConsent = values.health_consent === "on";
  if (health && !healthConsent) {
    errors.health_consent =
      "Para guardar la información de salud, marca esta casilla o deja el campo de salud vacío.";
  }
  if (opts.hasPhoto && get(form, "photo_consent") !== "on") {
    errors.photo_consent =
      "Para subir la foto, marca esta casilla o no elijas ninguna foto. Tendrás que volver a elegirla.";
  }

  if (Object.keys(errors).length) return { ok: false, errors, values };
  const opt = (k: string) => values[k] || null;
  return {
    ok: true,
    data: {
      name,
      species,
      species_other: species === "otro" ? speciesOther : null,
      breed: opt("breed"),
      birth_year: birth.year,
      birth_month: birth.month,
      birth_day: birth.day,
      death_year: death.year,
      death_month: death.month,
      death_day: death.day,
      sex,
      neutered,
      weight_kg: weight,
      diet: opt("diet"),
      origin,
      health: health || null,
      health_consent: healthConsent && Boolean(health),
    },
  };
}

/** ¿El fichero subido vale como foto? (tipo y tamaño; el contenido lo comprueba sharp). */
export function photoFileError(file: { size: number; type: string }): string | null {
  if (file.size > PET_PHOTO_MAX_BYTES) return "La foto pesa más de 8 MB.";
  if (!(PET_PHOTO_TYPES as readonly string[]).includes(file.type)) {
    return "Formato no válido: usa JPG, PNG, WebP o AVIF.";
  }
  return null;
}
