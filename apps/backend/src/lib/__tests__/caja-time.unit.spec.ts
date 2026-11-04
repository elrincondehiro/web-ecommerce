import {
  cajaTimeConfig,
  deadline,
  deadlineLabel,
  hashCajaToken,
  needsAlert,
  newCajaToken,
  parseHolidays,
  tokenMatches,
  workHoursBetween,
} from "../caja-time";

// Fechas en Madrid (CET, +01:00 en noviembre)
const at = (iso: string) => new Date(`${iso}+01:00`);
const none = new Set<string>();

describe("caja de snacks: plazos (Fase CS-4)", () => {
  it("horas laborables: de lunes a viernes; el fin de semana no cuenta", () => {
    // Lunes 9:00 → martes 9:00 = 24 h
    expect(workHoursBetween(at("2026-11-02T09:00:00"), at("2026-11-03T09:00:00"), none)).toBe(24);
    // Viernes 12:00 → lunes 12:00 = 12 h del viernes + 12 h del lunes
    expect(workHoursBetween(at("2026-11-06T12:00:00"), at("2026-11-09T12:00:00"), none)).toBe(24);
  });

  it("festivos de CAJA_FESTIVOS tampoco cuentan", () => {
    const holidays = parseHolidays("2026-12-08, x, 2026-12-25");
    expect([...holidays]).toEqual(["2026-12-08", "2026-12-25"]);
    // Lunes 7 → miércoles 9 de diciembre (el martes 8 es festivo) = 48 h
    expect(workHoursBetween(at("2026-12-07T00:00:00"), at("2026-12-10T00:00:00"), holidays)).toBe(
      48,
    );
  });

  it("aviso: 48 h laborables (un pedido del viernes avisa el martes, no el domingo)", () => {
    const cfg = cajaTimeConfig({});
    const friday = at("2026-11-06T10:00:00");
    expect(needsAlert(friday, at("2026-11-08T10:00:00"), cfg)).toBe(false); // domingo
    expect(needsAlert(friday, at("2026-11-10T09:45:00"), cfg)).toBe(false); // martes 9:45
    expect(needsAlert(friday, at("2026-11-10T10:00:00"), cfg)).toBe(true); // martes 10:00
  });

  it("configuración por variables, con valores por defecto", () => {
    expect(cajaTimeConfig({}).autoAcceptHours).toBe(24);
    expect(
      cajaTimeConfig({ CAJA_AUTOACCEPT_HOURS: "48", CAJA_ALERT_WORK_HOURS: "x" }),
    ).toMatchObject({
      autoAcceptHours: 48,
      alertWorkHours: 48,
    });
  });

  it("plazo de respuesta y su texto en Madrid", () => {
    const d = deadline(at("2026-11-03T18:30:00"), { autoAcceptHours: 24 });
    expect(d.toISOString()).toBe("2026-11-04T17:30:00.000Z");
    expect(deadlineLabel(d)).toBe("el miércoles, 4 de noviembre a las 18:30");
  });

  it("token: aleatorio, solo se guarda el hash y se compara bien", () => {
    const t = newCajaToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newCajaToken()).not.toBe(t);
    const h = hashCajaToken(t);
    expect(h).not.toContain(t);
    expect(tokenMatches(t, h)).toBe(true);
    expect(tokenMatches(`${t}x`, h)).toBe(false);
    expect(tokenMatches(t, null)).toBe(false);
    expect(tokenMatches("", h)).toBe(false);
  });
});
