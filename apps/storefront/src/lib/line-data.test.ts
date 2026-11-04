import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CAJA_PREPARING,
  cajaFromForm as fromForm,
  cajaSummary,
  customerLines,
  isCajaLine,
  orderLineDetails,
  lineDataError,
  lineDetails,
  type CajaForm,
} from "./line-data";

const REF = "0b8e7c2a-4d1f-4b6e-9a3c-5f2d1e0c9b8a";
const cajaFromForm = (f: CajaForm) => fromForm(f, REF);

const base: CajaForm = { animal: "perro", nombre: "Toby", edad: 3, peso: 12.5 };

describe("caja de snacks: formulario → metadata (Fase CS)", () => {
  it("mínimo válido: perro, nombre, edad y peso; pelo «me da igual» por defecto", () => {
    expect(cajaFromForm(base)).toEqual({
      ok: true,
      data: {
        caja_animal: "perro",
        caja_nombre: "Toby",
        caja_cachorro: false,
        caja_edad: 3,
        caja_peso: 12.5,
        caja_pelo: "igual",
        caja_ref: REF,
      },
    });
  });

  it("todo relleno, textos recortados; masticación sin repetidos", () => {
    const r = cajaFromForm({
      ...base,
      animal: "gato",
      raza: "  Mestizo ",
      no_gusta: "el cordero",
      probado: "orejas",
      pelo: "no",
      mastica: ["engulle", "ansioso", "engulle"],
      mastica_otro: "a trozos",
      salud: "alergia al pollo",
      salud_ok: true,
    });
    expect(r.ok && r.data).toMatchObject({
      caja_animal: "gato",
      caja_raza: "Mestizo",
      caja_pelo: "no",
      caja_mastica: ["engulle", "ansioso"],
      caja_mastica_otro: "a trozos",
      caja_salud: "alergia al pollo",
    });
  });

  it("salud: sin el consentimiento NO se guarda (aunque venga escrita)", () => {
    const r = cajaFromForm({ ...base, salud: "alergia al pollo", salud_ok: false });
    expect(r.ok && r.data.caja_salud).toBeUndefined();
    const r2 = cajaFromForm({ ...base, salud: "alergia al pollo" });
    expect(r2.ok && "caja_salud" in r2.data).toBe(false);
  });

  it("cachorro: edad en meses (1–12); adulto: años (1–25)", () => {
    expect(cajaFromForm({ ...base, cachorro: true, edad: 4 }).ok).toBe(true);
    expect(cajaFromForm({ ...base, cachorro: true, edad: 13 })).toEqual({
      ok: false,
      fields: ["edad"],
    });
    expect(cajaFromForm({ ...base, edad: 26 }).ok).toBe(false);
    expect(cajaFromForm({ ...base, edad: 0 }).ok).toBe(false);
    expect(cajaFromForm({ ...base, edad: 2.5 }).ok).toBe(false);
  });

  it("peso de 0,5 a 100 en saltos de 0,5", () => {
    expect(cajaFromForm({ ...base, peso: 0.5 }).ok).toBe(true);
    expect(cajaFromForm({ ...base, peso: 100 }).ok).toBe(true);
    expect(cajaFromForm({ ...base, peso: 12.3 }).ok).toBe(false);
    expect(cajaFromForm({ ...base, peso: 0 }).ok).toBe(false);
    expect(cajaFromForm({ ...base, peso: 100.5 }).ok).toBe(false);
  });

  it("errores por campo: obligatorios, largos, valores desconocidos; solo perro o gato", () => {
    const r = cajaFromForm({
      animal: "otro",
      nombre: " ",
      edad: null,
      peso: null,
      raza: "x".repeat(31),
      no_gusta: "y".repeat(81),
      pelo: "mucho",
      mastica: ["mordisquea"],
      mastica_otro: "a\u0007b",
    });
    expect(r).toEqual({
      ok: false,
      fields: [
        "animal",
        "nombre",
        "raza",
        "edad",
        "peso",
        "no_gusta",
        "pelo",
        "mastica",
        "mastica_otro",
      ],
    });
    expect(cajaFromForm({ ...base, animal: "pez" }).ok).toBe(false);
    expect(cajaFromForm({ ...base, nombre: "ñ".repeat(30) }).ok).toBe(true);
  });
});

describe("validación de la línea (backend, hook validar-carrito)", () => {
  const caja = (cajaFromForm({ ...base, salud: "pollo", salud_ok: true }) as { data: object }).data;

  it("caja: lo que sale del formulario vale; sin datos o con claves ajenas, no", () => {
    expect(lineDataError(caja, "caja")).toBeNull();
    expect(lineDataError(undefined, "caja")).toMatch(/para quién es/);
    expect(lineDataError({}, "caja")).toMatch(/para quién es/);
    expect(lineDataError({ ...caja, medida_cm: 640 }, "caja")).toMatch(/no válidos/);
    expect(lineDataError({ ...caja, caja_peso: 12.3 }, "caja")).toMatch(/caja de snacks/);
    expect(lineDataError({ ...caja, caja_cachorro: true, caja_edad: 20 }, "caja")).toMatch(
      /caja de snacks/,
    );
    expect(lineDataError({ ...caja, caja_nombre: "x".repeat(31) }, "caja")).toMatch(/caja/);
    expect(lineDataError({ ...caja, caja_mastica: ["engulle", "engulle"] }, "caja")).toMatch(
      /caja/,
    );
    // «Otro» animal ya no existe (solo perro o gato): ni el valor ni su clave valen
    expect(lineDataError({ ...caja, caja_animal: "otro" }, "caja")).toMatch(/caja/);
    expect(lineDataError({ ...caja, caja_animal_otro: "Hurón" }, "caja")).toMatch(/no válidos/);
  });

  it("caja_ref: obligatorio y con forma de UUID (cada envío, una caja distinta)", () => {
    const noRef: Record<string, unknown> = { ...caja };
    delete noRef.caja_ref;
    expect(lineDataError(noRef, "caja")).toMatch(/caja de snacks/);
    expect(lineDataError({ ...caja, caja_ref: "toby" }, "caja")).toMatch(/caja de snacks/);
    expect(lineDataError({ ...caja, caja_ref: REF.toUpperCase() }, "caja")).toMatch(/caja/);
    expect(isCajaLine(caja as Record<string, unknown>)).toBe(true);
    expect(isCajaLine({ medida_cm: 640 })).toBe(false);
    expect(isCajaLine(null)).toBe(false);
  });

  it("los datos de caja no valen en otros productos ni en la correa", () => {
    expect(lineDataError(caja, null)).toMatch(/no admite/);
    expect(lineDataError(caja, "correa", 7)).toMatch(/no válidos/);
    expect(lineDataError(undefined, null)).toBeNull();
    expect(lineDataError("texto", "caja")).toMatch(/no válidos/);
  });
});

describe("detalles de la línea (carrito, pedido, emails)", () => {
  it("caja completa", () => {
    expect(
      lineDetails({
        caja_animal: "perro",
        caja_nombre: "Toby",
        caja_raza: "Border collie",
        caja_cachorro: false,
        caja_edad: 3,
        caja_peso: 12.5,
        caja_pelo: "no",
        caja_mastica: ["engulle"],
        caja_mastica_otro: "a trozos",
        caja_salud: "alergia al pollo",
        caja_no_gusta: "el cordero",
        caja_probado: "orejas",
        caja_ref: REF,
      }),
    ).toEqual([
      "Para: Toby (perro, Border collie)",
      "3 años · 12,5 kg aprox.",
      "Snacks con pelo: no",
      "Mastica: engulle, a trozos",
      "Alergias o condiciones: alergia al pollo",
      "No le gusta: el cordero",
      "Ha probado: orejas",
    ]);
  });

  it("caja resumida (Fase CS): «Para Toby» del <details>, línea del email y lo de dentro", () => {
    expect(
      cajaSummary({
        caja_animal: "perro",
        caja_nombre: "Toby",
        caja_raza: "Border collie",
        caja_cachorro: false,
        caja_edad: 3,
        caja_peso: 12.5,
        caja_pelo: "no",
        caja_mastica: ["engulle"],
        caja_salud: "pollo",
      }),
    ).toEqual({
      name: "Para Toby",
      summary: "Para Toby (perro, Border collie, 3 años, 12,5 kg aprox.)",
      details: [
        "Perro, Border collie",
        "3 años · 12,5 kg aprox.",
        "Snacks con pelo: no",
        "Mastica: engulle",
        "Alergias o condiciones: pollo",
      ],
      emailDetails: ["Snacks con pelo: no", "Mastica: engulle", "Alergias o condiciones: pollo"],
    });
    expect(cajaSummary({ medida_cm: 640 })).toBeNull();
    expect(cajaSummary(null)).toBeNull();
  });

  it("cachorro, gato y singulares", () => {
    expect(
      lineDetails({
        caja_animal: "gato",
        caja_nombre: "Nube",
        caja_cachorro: true,
        caja_edad: 1,
        caja_peso: 1,
        caja_pelo: "igual",
      }),
    ).toEqual([
      "Para: Nube (gato)",
      "Cachorro de 1 mes · 1 kg aprox.",
      "Snacks con pelo: me da igual",
    ]);
  });

  it("correa: como antes", () => {
    expect(lineDetails({ medida_cm: 640, observaciones: " Para Hiro " })).toEqual([
      "Medida exacta: 6,40 m",
      "Observaciones: Para Hiro",
    ]);
    expect(lineDetails(null)).toEqual([]);
  });
});

describe("contenido de la caja en el pedido (Fase CS-3)", () => {
  it("el cliente no ve las líneas del contenido; la caja dice «Preparando tu caja»", () => {
    const box = { id: "a", metadata: { caja_nombre: "Toby", caja_ref: REF } };
    const content = { id: "b", metadata: { caja_de: "a" } };
    const normal = { id: "c", metadata: null };
    expect(customerLines([box, content, normal, null]).map((i) => i.id)).toEqual(["a", "c"]);
    expect(orderLineDetails(box.metadata)).toEqual(["Para: Toby", CAJA_PREPARING]);
    expect(orderLineDetails({ medida_cm: 640 })).toEqual(["Medida exacta: 6,40 m"]);
    expect(customerLines(null)).toEqual([]);
    // CS-4: propuesta o aceptada → se ve su contenido, marcado
    expect(customerLines([box, content, normal], new Set(["a"])).map((i) => i.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(orderLineDetails(box.metadata, "propuesta")).toEqual([
      "Para: Toby",
      "Te la hemos enseñado por email: dinos si te convence",
    ]);
    expect(orderLineDetails(content.metadata)).toEqual(["En la caja de snacks"]);
  });
});

describe("copia del backend", () => {
  it("apps/backend/src/lib/line-data.ts es idéntico a este fichero", () => {
    const here = readFileSync(new URL("./line-data.ts", import.meta.url), "utf8");
    const backend = readFileSync(
      new URL("../../../backend/src/lib/line-data.ts", import.meta.url),
      "utf8",
    );
    expect(backend).toBe(here);
  });
});
