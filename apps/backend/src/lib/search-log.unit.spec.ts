import { normalizeSearchTerm, searchTermsCsv, weekStart } from "./search-log";

describe("búsquedas (Fase MK-E2)", () => {
  it("normaliza: minúsculas, sin acentos (la ñ se queda), signos y espacios", () => {
    expect(normalizeSearchTerm("  Arnés   GATO! ")).toBe("arnes gato");
    expect(normalizeSearchTerm("Comida húmeda, senior")).toBe("comida humeda senior");
    expect(normalizeSearchTerm("PIÑA")).toBe("piña");
    expect(normalizeSearchTerm("pienso 12kg")).toBe("pienso 12kg");
  });
  it("descarta lo que puede ser personal o no sirve", () => {
    expect(normalizeSearchTerm("ana@correo.es")).toBeNull();
    expect(normalizeSearchTerm("600 123 456")).toBeNull();
    expect(normalizeSearchTerm("12345678Z")).toBeNull();
    expect(normalizeSearchTerm("a")).toBeNull();
    expect(normalizeSearchTerm("!!")).toBeNull();
    expect(normalizeSearchTerm("x".repeat(61))).toBeNull();
    expect(normalizeSearchTerm("pedido 2024")).toBe("pedido 2024");
  });
  it("semana = lunes UTC", () => {
    expect(weekStart(new Date("2026-11-12T10:00:00Z"))).toBe("2026-11-09"); // jueves
    expect(weekStart(new Date("2026-11-09T00:00:00Z"))).toBe("2026-11-09"); // lunes
    expect(weekStart(new Date("2026-11-15T23:59:00Z"))).toBe("2026-11-09"); // domingo
  });
  it("CSV con BOM, ; y sin fórmulas", () => {
    const csv = searchTermsCsv([
      { term: "arnes gato", count: 3, zero: 3, last_total: 0, last_week: "2026-11-09" },
      { term: '=1+1 "x"', count: 1, zero: 0, last_total: 4, last_week: "2026-11-02" },
    ]);
    expect(csv.startsWith("\uFEFFtermino;busquedas;")).toBe(true);
    expect(csv).toContain('"arnes gato";3;3;0;"2026-11-09"\r\n');
    expect(csv).toContain(`"'=1+1 ""x""";1;0;4;"2026-11-02"`);
  });
});
