// Fase MK-A: temas, plan de consentimientos, token de baja y cabeceras. La copia idéntica de
// lib/comms.ts la comprueba el storefront (comms.test.ts).
import { parseCommsTopics } from "../comms";
import { unsubscribeHeaders, unsubscribeUrl } from "../comms-email";
import { consentPlan, consentStates } from "../comms-plan";
import { readUnsubscribeToken, unsubscribeToken } from "../comms-token";
import { emailHeaders } from "../../modules/resend-notification/service";

const env = { COMMS_UNSUBSCRIBE_SECRET: "x".repeat(40) } as NodeJS.ProcessEnv;
const CUS = "cus_01KABCDEFGHJKMNPQRSTVWXYZ";

describe("comunicaciones (Fase MK-A)", () => {
  it("temas válidos, sin repetir y en orden", () => {
    expect(parseCommsTopics(["gincana", "otro", "novedades", "gincana", 3])).toEqual([
      "novedades",
      "gincana",
    ]);
  });

  it("plan: abre los nuevos y cierra los que ya no quiere", () => {
    const active = [
      { id: "cmc_1", topic: "novedades" as const, granted_at: "2026-11-01T10:00:00Z" },
      { id: "cmc_2", topic: "gincana" as const, granted_at: "2026-11-02T10:00:00Z" },
    ];
    expect(consentPlan(active, ["novedades", "cumpleanos"])).toEqual({
      grant: [{ topic: "cumpleanos", text_version: 1 }],
      revoke: ["cmc_2"],
    });
    expect(consentPlan(active, ["novedades", "gincana"])).toEqual({ grant: [], revoke: [] });
    expect(consentStates(active)).toEqual([
      { id: "novedades", granted: true, granted_at: "2026-11-01T10:00:00.000Z" },
      { id: "cumpleanos", granted: false, granted_at: null },
      { id: "gincana", granted: true, granted_at: "2026-11-02T10:00:00.000Z" },
    ]);
  });

  it("token de baja: ida y vuelta, firma y formato", () => {
    const token = unsubscribeToken({ customer_id: CUS, topic: "novedades" }, env);
    expect(readUnsubscribeToken(token, env)).toEqual({ customer_id: CUS, topic: "novedades" });
    // Otro tema con la firma de otro → no vale
    const other = token.replace(".novedades.", ".gincana.");
    expect(readUnsubscribeToken(other, env)).toBeNull();
    // Otro secreto → no vale
    expect(
      readUnsubscribeToken(token, {
        COMMS_UNSUBSCRIBE_SECRET: "y".repeat(40),
      } as NodeJS.ProcessEnv),
    ).toBeNull();
    for (const bad of ["", "a.b", `${CUS}.novedades`, `x.novedades.${token.split(".")[2]}`]) {
      expect(readUnsubscribeToken(bad, env)).toBeNull();
    }
  });

  it("sin secreto (o corto) no se firma", () => {
    expect(() => unsubscribeToken({ customer_id: CUS, topic: "novedades" }, {})).toThrow(
      /COMMS_UNSUBSCRIBE_SECRET/,
    );
  });

  it("URL y cabeceras de baja de un clic (RFC 8058)", () => {
    const url = unsubscribeUrl("https://tienda.es/", "a.b+c");
    expect(url).toBe("https://tienda.es/baja/?t=a.b%2Bc");
    expect(unsubscribeHeaders(url)).toEqual({
      "List-Unsubscribe": `<${url}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });

  it("el proveedor solo deja pasar las cabeceras de baja", () => {
    expect(emailHeaders(null)).toBeUndefined();
    expect(emailHeaders({ headers: { Bcc: "x@y.z" } })).toBeUndefined();
    expect(
      emailHeaders({
        headers: { "List-Unsubscribe": "<u>", Bcc: "x", "List-Unsubscribe-Post": 1 },
      }),
    ).toEqual({ "List-Unsubscribe": "<u>" });
  });
});
