import { describe, expect, it } from "vitest";
import { classifyCodeError, codeUsed, normalizeCode } from "./codes";

describe("códigos descuento (Fase P)", () => {
  it("normaliza y rechaza formato no válido y códigos de puntos", () => {
    expect(normalizeCode(" hiro10 ")).toBe("HIRO10");
    expect(normalizeCode("A")).toBeNull();
    expect(normalizeCode("PTS-ABC")).toBeNull();
    expect(normalizeCode("con espacio")).toBeNull();
    expect(normalizeCode(null)).toBeNull();
  });

  it("descuento del código: ajustes que no son de puntos", () => {
    expect(
      codeUsed([
        {
          adjustments: [
            { code: "HIRO10", amount: 3 },
            { code: "PTS-X", amount: 5 },
          ],
        },
        { adjustments: [{ code: "HIRO10", amount: 2.5 }] },
        null,
      ]),
    ).toEqual({ code: "HIRO10", amount: 5.5 });
    expect(codeUsed(undefined)).toEqual({ code: null, amount: 0 });
  });

  it("errores del backend → aviso", () => {
    const e = (message: string, status: number) => Object.assign(new Error(message), { status });
    expect(classifyCodeError(e("Ese código no existe o no es válido.", 400))).toBe("code_invalid");
    expect(
      classifyCodeError(e("Ese código no se puede usar en este pedido: puede haber…", 400)),
    ).toBe("code_not_applied");
    expect(classifyCodeError(e("Unauthorized", 401))).toBe("code_login");
    expect(classifyCodeError(e("Carrito no encontrado", 404))).toBe("expired");
    expect(classifyCodeError(e("boom", 500))).toBe("error");
  });
});
