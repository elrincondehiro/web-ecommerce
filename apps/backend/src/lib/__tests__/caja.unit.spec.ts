import { CAJA_MESSAGES, checkContent, lowPvpMessage, type CandidateVariant } from "../caja";

const v = (id: string, price: number | null, extra: Partial<CandidateVariant> = {}) =>
  [id, { id, price, published: true, snack: true, stepG: null, ...extra }] as const;
const variants = new Map<string, CandidateVariant>([
  v("orejas", 6),
  v("tiras", 8.35),
  v("collar", 30, { snack: false }),
  v("granel", 0.1, { stepG: 5 }), // 20 €/kg: 0,10 € el paso de 5 g
  v("borrador", 5, { published: false }),
  v("sinprecio", null),
]);

describe("caja de snacks: contenido (Fase CS-3)", () => {
  it("PVP en céntimos exactos; vale si llega a lo pagado", () => {
    expect(
      checkContent(
        [
          { variant_id: "orejas", quantity: 3 },
          { variant_id: "tiras", quantity: 1 },
        ],
        variants,
        26.35,
      ),
    ).toEqual({
      ok: true,
      pvp: 26.35,
      lines: [
        { variant_id: "orejas", quantity: 3 },
        { variant_id: "tiras", quantity: 1 },
      ],
    });
  });

  it("PVP por debajo de lo pagado: no", () => {
    expect(checkContent([{ variant_id: "orejas", quantity: 4 }], variants, 25)).toEqual({
      ok: false,
      message: lowPvpMessage(24, 25),
    });
    expect(lowPvpMessage(24, 25)).toBe(
      "El contenido vale 24,00 € (PVP) y la caja 25,00 €: tiene que valer al menos lo pagado.",
    );
  });

  it("granel: gramos → pasos; múltiplo del paso, hasta 1000 g, sin el mínimo de la web", () => {
    // 150 g a 20 €/kg = 3 € (30 pasos de 5 g) + 4 orejas (24 €) = 27 €
    expect(
      checkContent(
        [
          { variant_id: "granel", quantity: 150 },
          { variant_id: "orejas", quantity: 4 },
        ],
        variants,
        27,
      ),
    ).toEqual({
      ok: true,
      pvp: 27,
      lines: [
        { variant_id: "granel", quantity: 30 },
        { variant_id: "orejas", quantity: 4 },
      ],
    });
    const g = (grams: number) =>
      checkContent([{ variant_id: "granel", quantity: grams }], variants, 0);
    expect(g(5)).toMatchObject({ ok: true, lines: [{ quantity: 1 }] }); // menos que min_g: vale
    expect(g(1000)).toMatchObject({ ok: true, pvp: 20 });
    expect(g(1005)).toEqual({ ok: false, message: CAJA_MESSAGES.grams });
    expect(g(152)).toEqual({ ok: false, message: CAJA_MESSAGES.grams });
    expect(g(0)).toEqual({ ok: false, message: CAJA_MESSAGES.grams });
  });

  it("solo snacks publicados con precio; sin repetidos ni cantidades raras", () => {
    const one = (variant_id: string, quantity = 9) =>
      checkContent([{ variant_id, quantity }], variants, 0);
    expect(one("collar")).toEqual({ ok: false, message: CAJA_MESSAGES.notSnack });
    expect(one("borrador")).toEqual({ ok: false, message: CAJA_MESSAGES.unknown });
    expect(one("sinprecio")).toEqual({ ok: false, message: CAJA_MESSAGES.unknown });
    expect(one("nada")).toEqual({ ok: false, message: CAJA_MESSAGES.unknown });
    expect(one("orejas", 0)).toEqual({ ok: false, message: CAJA_MESSAGES.quantity });
    expect(one("orejas", 21)).toEqual({ ok: false, message: CAJA_MESSAGES.quantity });
    expect(one("orejas", 1.5)).toEqual({ ok: false, message: CAJA_MESSAGES.quantity });
    expect(checkContent([], variants, 0)).toEqual({ ok: false, message: CAJA_MESSAGES.empty });
    expect(
      checkContent(
        [
          { variant_id: "orejas", quantity: 1 },
          { variant_id: "orejas", quantity: 2 },
        ],
        variants,
        0,
      ),
    ).toEqual({ ok: false, message: CAJA_MESSAGES.duplicate });
  });
});
