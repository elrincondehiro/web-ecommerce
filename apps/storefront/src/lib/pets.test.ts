import { describe, expect, it } from "vitest";
import {
  parsePetForm,
  partialDateError,
  partialDateLabel,
  petAgeLabel,
  petFormValues,
  photoFileError,
  speciesLabel,
  type Pet,
} from "./pets";

const today = new Date(2026, 9, 24); // 24-oct-2026
const form = (data: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(data)) f.set(k, v);
  return f;
};
const parse = (data: Record<string, string>, hasPhoto = false) =>
  parsePetForm(form(data), { hasPhoto, today });
type Ymd = [number | null, number | null, number | null];
const dates = (b: Ymd, d: Ymd = [null, null, null]) => ({
  birth_year: b[0],
  birth_month: b[1],
  birth_day: b[2],
  death_year: d[0],
  death_month: d[1],
  death_day: d[2],
});

describe("mascotas (Fase M)", () => {
  it("formulario mínimo: nombre y tipo; opcionales vacíos a null", () => {
    const res = parse({ name: " Hiro ", species: "perro", breed: "", weight_kg: "" });
    expect(res).toEqual({
      ok: true,
      data: expect.objectContaining({
        name: "Hiro",
        species: "perro",
        breed: null,
        weight_kg: null,
        health: null,
        health_consent: false,
        birth_year: null,
      }),
    });
  });

  it("datos completos: fechas parciales, peso con coma, listas", () => {
    const res = parse({
      name: "Luna",
      species: "otro",
      species_other: "Cobaya",
      birth_year: "2020",
      birth_month: "3",
      birth_day: "",
      death_year: "2026",
      death_month: "5",
      death_day: "14",
      sex: "hembra",
      neutered: "si",
      weight_kg: "1,25",
      origin: "rescatado",
      diet: "Heno",
      health: "Alergia al trigo",
      health_consent: "on",
    });
    expect(res.ok && res.data).toMatchObject({
      species_other: "Cobaya",
      birth_year: 2020,
      birth_month: 3,
      birth_day: null,
      death_day: 14,
      weight_kg: 1.3,
      health_consent: true,
    });
  });

  it("errores por campo y valores para volver a rellenar", () => {
    const res = parse({
      name: "",
      species: "dragon",
      birth_month: "3",
      weight_kg: "mucho",
      sex: "x",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(Object.keys(res.errors).sort()).toEqual(
      ["birth_year", "name", "sex", "species", "weight_kg"].sort(),
    );
    expect(res.values.weight_kg).toBe("mucho");
  });

  it("fechas: día sin mes, día que no existe, futura, fallecimiento antes del nacimiento", () => {
    const err = (d: Record<string, string>) => {
      const r = parse({ name: "A", species: "gato", ...d });
      return r.ok ? null : r.errors;
    };
    expect(err({ birth_year: "2020", birth_day: "3" })).toHaveProperty("birth_year");
    expect(err({ birth_year: "2023", birth_month: "2", birth_day: "29" })).toHaveProperty(
      "birth_year",
    );
    expect(err({ birth_year: "2027" })).toHaveProperty("birth_year");
    expect(err({ birth_year: "2020", death_year: "2019" })).toEqual({
      death_year: "No puede ser anterior al nacimiento.",
    });
    expect(err({ birth_year: "20" })).toHaveProperty("birth_year");
    expect(partialDateError({ year: 2026, month: 10, day: 24 }, today)).toBeNull();
  });

  it("consentimientos: salud sin casilla y foto sin casilla no se guardan", () => {
    const health = parse({ name: "A", species: "gato", health: "Diabetes" });
    expect(!health.ok && health.errors.health_consent).toBeTruthy();
    expect(!health.ok && health.values.health).toBe("Diabetes");
    // Casilla marcada pero sin texto: no hay consentimiento que guardar.
    const empty = parse({ name: "A", species: "gato", health_consent: "on" });
    expect(empty.ok && empty.data.health_consent).toBe(false);

    const photo = parse({ name: "A", species: "gato" }, true);
    expect(!photo.ok && photo.errors.photo_consent).toBeTruthy();
    expect(parse({ name: "A", species: "gato", photo_consent: "on" }, true).ok).toBe(true);
  });

  it("foto: tipo y tamaño", () => {
    expect(photoFileError({ size: 2_000_000, type: "image/jpeg" })).toBeNull();
    expect(photoFileError({ size: 9 * 1024 * 1024, type: "image/jpeg" })).toMatch(/8 MB/);
    expect(photoFileError({ size: 1000, type: "image/gif" })).toMatch(/Formato/);
  });

  it("edad aproximada, fechas en texto y especie", () => {
    expect(petAgeLabel(dates([null, null, null]), today)).toBeNull();
    expect(petAgeLabel(dates([2020, null, null]), today)).toBe("6 años");
    expect(petAgeLabel(dates([2023, 8, null]), today)).toBe("3 años y 2 meses");
    expect(petAgeLabel(dates([2026, 5, null]), today)).toBe("5 meses");
    expect(petAgeLabel(dates([2010, 3, null], [2022, 6, null]), today)).toBe("12 años y 3 meses");
    expect(partialDateLabel(2021, 3, 14)).toBe("14 de marzo de 2021");
    expect(partialDateLabel(2021, 3, null)).toBe("marzo de 2021");
    expect(partialDateLabel(2021, null, null)).toBe("2021");
    expect(speciesLabel({ species: "otro", species_other: "Cobaya" })).toBe("Cobaya");
    expect(speciesLabel({ species: "huron", species_other: null })).toBe("Hurón");
  });

  it("valores del formulario desde la ficha guardada", () => {
    const pet = {
      id: "pet_1",
      name: "Hiro",
      species: "perro",
      species_other: null,
      breed: null,
      ...dates([2020, 3, null]),
      sex: "macho",
      neutered: null,
      weight_kg: 18.5,
      diet: null,
      origin: null,
      health: "Alergia",
      health_consent_at: "2026-01-01T00:00:00Z",
      photo_url: null,
      photo_consent_at: null,
    } satisfies Pet;
    expect(petFormValues(pet)).toMatchObject({
      name: "Hiro",
      birth_year: "2020",
      birth_day: "",
      weight_kg: "18,5",
      health_consent: "on",
    });
  });
});
