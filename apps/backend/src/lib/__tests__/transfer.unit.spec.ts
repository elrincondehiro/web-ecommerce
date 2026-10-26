import {
  formatDay,
  formatIban,
  lastPayDay,
  transferConfig,
  transferConcept,
  transferDays,
  transferStage,
} from "../transfer";

describe("transferencia (Fase PG-3)", () => {
  it("configuración: IBAN y titular obligatorios; días 1–14 (por defecto 3)", () => {
    expect(transferConfig({}).enabled).toBe(false);
    const c = transferConfig({
      TRANSFER_IBAN: "es91 2100 0418 4502 0005 1332",
      TRANSFER_HOLDER: " Hiro SL ",
    });
    expect(c).toEqual({
      enabled: true,
      iban: "ES9121000418450200051332",
      holder: "Hiro SL",
      days: 3,
    });
    expect(transferConfig({ TRANSFER_IBAN: "ES91", TRANSFER_HOLDER: "x" }).enabled).toBe(false);
    expect(transferConfig({ TRANSFER_IBAN: c.iban }).enabled).toBe(false);
    expect(transferDays("5")).toBe(5);
    expect(transferDays("0")).toBe(3);
    expect(transferDays("x")).toBe(3);
    expect(formatIban(c.iban)).toBe("ES91 2100 0418 4502 0005 1332");
  });

  it("plazos en hora de España: recordatorio el último día, cancelación al siguiente", () => {
    // 25 oct 2026 23:30 en España (21:30 UTC, ya en horario de invierno... 22:30 UTC en verano)
    const created = "2026-10-25T22:30:00Z"; // = 25 oct 23:30 en España (UTC+1)
    expect(lastPayDay(created, 3)).toBe("2026-10-28");
    expect(transferStage(created, new Date("2026-10-27T08:00:00Z"), 3)).toBe("wait");
    expect(transferStage(created, new Date("2026-10-28T08:00:00Z"), 3)).toBe("remind");
    expect(transferStage(created, new Date("2026-10-28T22:59:00Z"), 3)).toBe("remind");
    expect(transferStage(created, new Date("2026-10-28T23:01:00Z"), 3)).toBe("cancel");
    // Medianoche en España: ya es el día siguiente
    expect(lastPayDay("2026-10-25T23:30:00Z", 3)).toBe("2026-10-29");
    // Fin de mes
    expect(lastPayDay("2026-12-30T10:00:00Z", 3)).toBe("2027-01-02");
  });

  it("textos", () => {
    expect(formatDay("2026-10-28")).toBe("28 de octubre de 2026");
    expect(transferConcept(1042)).toBe("Pedido 1042");
  });
});
