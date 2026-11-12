import { goneLabel, isBirthdayToday, madridToday, showcaseState } from "../pets";
import { showcaseCard } from "../pets-showcase";

const prev = (consentAt: string | null, status: "pendiente" | "aprobada" | "rechazada" | null) => ({
  consentAt,
  status,
});

describe("escaparate (Fase MK-D)", () => {
  it("casilla nueva con foto → pendiente; sin foto → guardada pero fuera", () => {
    expect(
      showcaseState({
        consent: true,
        hasPhoto: true,
        photoChanged: false,
        previous: prev(null, null),
      }).showcase_status,
    ).toBe("pendiente");
    const noPhoto = showcaseState({
      consent: true,
      hasPhoto: false,
      photoChanged: false,
      previous: prev(null, null),
    });
    expect(noPhoto.showcase_consent_at).not.toBeNull();
    expect(noPhoto.showcase_status).toBeNull();
  });

  it("aprobada se mantiene al editar datos; foto nueva → pendiente otra vez", () => {
    const p = prev("2026-11-01T00:00:00Z", "aprobada");
    expect(
      showcaseState({ consent: true, hasPhoto: true, photoChanged: false, previous: p })
        .showcase_status,
    ).toBe("aprobada");
    expect(
      showcaseState({ consent: undefined, hasPhoto: true, photoChanged: true, previous: p })
        .showcase_status,
    ).toBe("pendiente");
    // El Admin no envía la casilla: se respeta la del cliente
    expect(
      showcaseState({ consent: undefined, hasPhoto: true, photoChanged: false, previous: p })
        .showcase_status,
    ).toBe("aprobada");
  });

  it("quitar la casilla o la foto la saca", () => {
    const p = prev("2026-11-01T00:00:00Z", "aprobada");
    expect(
      showcaseState({ consent: false, hasPhoto: true, photoChanged: false, previous: p }),
    ).toEqual({
      showcase_consent_at: null,
      showcase_status: null,
    });
    expect(
      showcaseState({ consent: undefined, hasPhoto: false, photoChanged: true, previous: p })
        .showcase_status,
    ).toBeNull();
  });

  it("tarjeta pública: solo nombre, foto y edad; fallecidas «Hiro · 2009–2023»", () => {
    const base = {
      id: "pet_1",
      customer_id: "cus_1",
      name: "Hiro",
      photo_url: "https://img/x.webp",
      birth_year: 2009,
      birth_month: 3,
      birth_day: null,
      death_year: 2023,
      death_month: null,
      death_day: null,
      showcase_status: "aprobada" as const,
      showcase_consent_at: new Date(),
      showcase_reviewed_at: new Date(),
      updated_at: new Date(),
    };
    expect(showcaseCard(base)).toEqual({
      name: "Hiro",
      photo: "https://img/x.webp",
      label: "Hiro · 2009–2023",
    });
    expect(goneLabel("Luna", null, 2020)).toBe("Luna · †2020");
    const alive = showcaseCard(
      { ...base, death_year: null, birth_year: 2022, birth_month: 1 },
      new Date("2026-11-11"),
    );
    expect(alive).toEqual({
      name: "Hiro",
      photo: "https://img/x.webp",
      label: "4 años y 10 meses",
    });
  });
});

describe("cumpleaños (Fase MK-D)", () => {
  const pet = (
    y: number | null,
    m: number | null,
    d: number | null,
    death: number | null = null,
  ) => ({
    birth_year: y,
    birth_month: m,
    birth_day: d,
    death_year: death,
  });
  const today = { year: 2026, month: 11, day: 11 };

  it("con día: ese día; con solo mes: el día 1; sin mes, nunca", () => {
    expect(isBirthdayToday(pet(2020, 11, 11), today)).toBe(true);
    expect(isBirthdayToday(pet(2020, 11, 12), today)).toBe(false);
    expect(isBirthdayToday(pet(2020, 11, null), today)).toBe(false);
    expect(isBirthdayToday(pet(2020, 11, null), { ...today, day: 1 })).toBe(true);
    expect(isBirthdayToday(pet(2020, null, null), { ...today, day: 1 })).toBe(false);
  });

  it("fallecidas y nacidas este año, no; 29 de febrero → 28 en años no bisiestos", () => {
    expect(isBirthdayToday(pet(2020, 11, 11, 2025), today)).toBe(false);
    expect(isBirthdayToday(pet(2026, 11, 11), today)).toBe(false);
    expect(isBirthdayToday(pet(2020, 2, 29), { year: 2027, month: 2, day: 28 })).toBe(true);
    expect(isBirthdayToday(pet(2020, 2, 29), { year: 2028, month: 2, day: 28 })).toBe(false);
    expect(isBirthdayToday(pet(2020, 2, 29), { year: 2028, month: 2, day: 29 })).toBe(true);
  });

  it("fecha de Madrid (no la del servidor en UTC)", () => {
    // 23:30 UTC del 31-dic = 00:30 del 1-ene en Madrid (invierno, UTC+1)
    expect(madridToday(new Date("2026-12-31T23:30:00Z"))).toEqual({ year: 2027, month: 1, day: 1 });
  });
});
