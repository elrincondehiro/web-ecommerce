import {
  comparePartial,
  isWebp,
  partialDateError,
  petAgeLabel,
  petFieldsErrors,
  petRecord,
  type PetFields,
} from "../pets";

const today = new Date(2026, 9, 24); // 24-oct-2026
const d = (year: number | null, month: number | null = null, day: number | null = null) => ({
  year,
  month,
  day,
});

const fields = (over: Partial<PetFields> = {}): PetFields => ({
  name: "Hiro",
  species: "perro",
  species_other: null,
  breed: null,
  birth_year: null,
  birth_month: null,
  birth_day: null,
  death_year: null,
  death_month: null,
  death_day: null,
  sex: null,
  neutered: null,
  weight_kg: null,
  diet: null,
  origin: null,
  health: null,
  health_consent: false,
  ...over,
});

describe("mascotas (Fase M)", () => {
  it("fecha parcial: año, año + mes, año + mes + día; no futura", () => {
    expect(partialDateError(d(null), today)).toBeNull();
    expect(partialDateError(d(2020), today)).toBeNull();
    expect(partialDateError(d(2020, 3), today)).toBeNull();
    expect(partialDateError(d(2024, 2, 29), today)).toBeNull();
    expect(partialDateError(d(null, 3), today)).toBe("Falta el año");
    expect(partialDateError(d(2020, null, 3), today)).toBe("Falta el mes");
    expect(partialDateError(d(2023, 2, 29), today)).toBe("Día no válido");
    expect(partialDateError(d(1970), today)).toBe("Año no válido");
    expect(partialDateError(d(2026, 11), today)).toBe("La fecha no puede ser futura");
    expect(partialDateError(d(2026, 10, 25), today)).toBe("La fecha no puede ser futura");
    expect(partialDateError(d(2026, 10), today)).toBeNull(); // este mes
  });

  it("compara con la precisión común", () => {
    expect(comparePartial(d(2020), d(2020, 5))).toBe(0);
    expect(comparePartial(d(2020, 4), d(2020, 5))).toBeLessThan(0);
    expect(comparePartial(d(2020, 5, 2), d(2020, 5, 1))).toBeGreaterThan(0);
  });

  it("edad aproximada (y hasta el fallecimiento)", () => {
    expect(petAgeLabel(d(null), null, today)).toBeNull();
    expect(petAgeLabel(d(2020), null, today)).toBe("6 años");
    expect(petAgeLabel(d(2026), null, today)).toBe("menos de 1 año");
    expect(petAgeLabel(d(2023, 8), null, today)).toBe("3 años y 2 meses");
    expect(petAgeLabel(d(2025, 10), null, today)).toBe("1 año");
    expect(petAgeLabel(d(2026, 5), null, today)).toBe("5 meses");
    expect(petAgeLabel(d(2026, 10), null, today)).toBe("menos de 1 mes");
    expect(petAgeLabel(d(2025, 10, 25), null, today)).toBe("11 meses");
    expect(petAgeLabel(d(2010, 3), d(2022, 6), today)).toBe("12 años y 3 meses");
  });

  it("errores de los datos: fallecimiento anterior, especie «otro», salud sin consentimiento", () => {
    expect(petFieldsErrors(fields(), today)).toEqual({});
    expect(petFieldsErrors(fields({ birth_year: 2020, death_year: 2019 }), today)).toEqual({
      death: "No puede ser anterior al nacimiento",
    });
    expect(petFieldsErrors(fields({ species: "otro" }), today)).toHaveProperty("species_other");
    expect(petFieldsErrors(fields({ health: "Alergia" }), today)).toHaveProperty("health_consent");
    expect(petFieldsErrors(fields({ health: "Alergia", health_consent: true }), today)).toEqual({});
  });

  it("lo que se guarda: salud solo con consentimiento; se conserva la fecha del primero", () => {
    const now = new Date("2026-10-24T10:00:00Z");
    const prev = "2026-01-01T00:00:00.000Z";
    expect(petRecord(fields({ health: "Alergia", health_consent: true }), null, now)).toMatchObject(
      { health: "Alergia", health_consent_at: now },
    );
    expect(
      petRecord(fields({ health: "Alergia", health_consent: true }), prev, now).health_consent_at,
    ).toEqual(new Date(prev));
    expect(petRecord(fields({ health: null, health_consent: true }), prev, now)).toMatchObject({
      health: null,
      health_consent_at: null,
    });
    expect(petRecord(fields({ species_other: "Cobaya" }), null, now).species_other).toBeNull();
    expect(petRecord(fields(), null, now)).not.toHaveProperty("health_consent");
  });

  it("reconoce WebP", () => {
    const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 ")]);
    expect(isWebp(webp)).toBe(true);
    expect(isWebp(Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array(20).fill(0)]))).toBe(false);
  });
});
