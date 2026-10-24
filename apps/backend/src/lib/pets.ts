/**
 * Mascotas de los clientes (Fase M, docs/fases/faseM-mascotas.md): valores permitidos y reglas
 * PURAS (sin BD) para poder probarlas. Las usan el modelo, las rutas (store y admin) y el email
 * de aviso a la tienda.
 */

export const PET_SPECIES = [
  "perro",
  "gato",
  "conejo",
  "huron",
  "roedor",
  "ave",
  "reptil",
  "otro",
] as const;
export const PET_SEX = ["macho", "hembra", "desconocido"] as const;
export const PET_YES_NO = ["si", "no", "desconocido"] as const;
export const PET_ORIGINS = [
  "adoptado",
  "rescatado",
  "criador",
  "tienda",
  "familia",
  "otro",
] as const;
/** Preparado para compartir fichas (protectoras): de momento siempre `casa`. */
export const PET_STATUS = ["casa", "adopcion", "acogida"] as const;

export type PetSpecies = (typeof PET_SPECIES)[number];

export const PET_MAX_PER_CUSTOMER = 20;
export const PET_MIN_YEAR = 1980;
/** Foto ya reducida por el storefront o el Admin (800 px WebP): ~50–150 KB. */
export const PET_PHOTO_MAX_BYTES = 600 * 1024;

export const SPECIES_LABEL: Record<PetSpecies, string> = {
  perro: "Perro",
  gato: "Gato",
  conejo: "Conejo",
  huron: "Hurón",
  roedor: "Roedor",
  ave: "Ave",
  reptil: "Reptil",
  otro: "Otro",
};

export type PartialDate = { year: number | null; month: number | null; day: number | null };

/**
 * Comprueba una fecha parcial (año, año + mes o año + mes + día): el mes exige año, el día exige
 * mes, la fecha existe y no es futura. Todo vacío = sin fecha. Devuelve el motivo o `null`.
 */
export function partialDateError(d: PartialDate, today = new Date()): string | null {
  const { year, month, day } = d;
  if (year == null && month == null && day == null) return null;
  if (year == null) return "Falta el año";
  if (day != null && month == null) return "Falta el mes";
  if (year < PET_MIN_YEAR) return "Año no válido";
  if (month != null && (month < 1 || month > 12)) return "Mes no válido";
  if (day != null) {
    const date = new Date(Date.UTC(year, month! - 1, day));
    if (date.getUTCMonth() !== month! - 1 || day < 1) return "Día no válido";
  }
  if (comparePartial(d, todayParts(today)) > 0) return "La fecha no puede ser futura";
  return null;
}

function todayParts(today: Date): PartialDate {
  return { year: today.getFullYear(), month: today.getMonth() + 1, day: today.getDate() };
}

/**
 * Compara dos fechas parciales con la precisión común (si una no tiene mes, solo el año):
 * < 0 si `a` es anterior, 0 si coinciden (o no se puede saber), > 0 si es posterior.
 */
export function comparePartial(a: PartialDate, b: PartialDate): number {
  if (a.year == null || b.year == null) return 0;
  if (a.year !== b.year) return a.year - b.year;
  if (a.month == null || b.month == null) return 0;
  if (a.month !== b.month) return a.month - b.month;
  if (a.day == null || b.day == null) return 0;
  return a.day - b.day;
}

/** Errores de las dos fechas de la mascota (campo → motivo); el fallecimiento no antes del nacimiento. */
export function petDatesErrors(
  birth: PartialDate,
  death: PartialDate,
  today = new Date(),
): Record<string, string> {
  const errors: Record<string, string> = {};
  const b = partialDateError(birth, today);
  if (b) errors.birth = b;
  const d = partialDateError(death, today);
  if (d) errors.death = d;
  if (!b && !d && death.year != null && birth.year != null && comparePartial(death, birth) < 0) {
    errors.death = "No puede ser anterior al nacimiento";
  }
  return errors;
}

/**
 * Edad en texto a partir del nacimiento (aproximado) y, si ha fallecido, hasta esa fecha.
 * Sin mes: solo años. «menos de 1 mes», «5 meses», «1 año», «3 años y 2 meses».
 */
export function petAgeLabel(
  birth: PartialDate,
  death: PartialDate | null = null,
  today = new Date(),
): string | null {
  if (birth.year == null) return null;
  const end = death?.year != null ? death : todayParts(today);
  const endYear = end.year!;
  if (birth.month == null || end.month == null) {
    const years = Math.max(0, endYear - birth.year);
    return years === 0 ? "menos de 1 año" : years === 1 ? "1 año" : `${years} años`;
  }
  let months = (endYear - birth.year) * 12 + (end.month - birth.month);
  if (birth.day != null && end.day != null && end.day < birth.day) months -= 1;
  months = Math.max(0, months);
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const y = years === 1 ? "1 año" : `${years} años`;
  const m = rest === 1 ? "1 mes" : `${rest} meses`;
  if (years === 0) return rest === 0 ? "menos de 1 mes" : m;
  return rest === 0 ? y : `${y} y ${m}`;
}

/** Datos del formulario (store y admin) ya validados por zod. */
export type PetFields = {
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
  sex: (typeof PET_SEX)[number] | null;
  neutered: (typeof PET_YES_NO)[number] | null;
  weight_kg: number | null;
  diet: string | null;
  origin: (typeof PET_ORIGINS)[number] | null;
  health: string | null;
  /** Consentimiento para guardar la salud (en el Admin: «el cliente lo ha autorizado»). */
  health_consent: boolean;
};

/** Errores de negocio de los datos (campo → motivo). Vacío = válido. */
export function petFieldsErrors(f: PetFields, today = new Date()): Record<string, string> {
  const errors = petDatesErrors(
    { year: f.birth_year, month: f.birth_month, day: f.birth_day },
    { year: f.death_year, month: f.death_month, day: f.death_day },
    today,
  );
  if (f.species === "otro" && !f.species_other) errors.species_other = "Indica qué animal es";
  if (f.health && !f.health_consent) {
    errors.health_consent =
      "Para guardar la información de salud, marca la casilla de consentimiento o deja el campo vacío";
  }
  return errors;
}

/**
 * Lo que se guarda a partir del formulario: sin consentimiento no hay salud (retirarlo la borra);
 * la fecha del consentimiento se mantiene si ya lo había dado.
 */
export function petRecord(
  f: PetFields,
  previousConsentAt: Date | string | null,
  now = new Date(),
): Omit<PetFields, "health_consent" | "species_other"> & {
  species_other: string | null;
  health_consent_at: Date | null;
} {
  const { health_consent, ...rest } = f;
  const consent = health_consent && Boolean(f.health);
  return {
    ...rest,
    species_other: f.species === "otro" ? f.species_other : null,
    health: consent ? f.health : null,
    health_consent_at: consent ? (previousConsentAt ? new Date(previousConsentAt) : now) : null,
  };
}

/** Cabecera de una imagen WebP (RIFF....WEBP): la foto llega ya convertida. */
export function isWebp(buf: Buffer): boolean {
  return (
    buf.length > 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  );
}
