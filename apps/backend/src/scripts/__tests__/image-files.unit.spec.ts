import {
  parseImageFileName,
  planProductImages,
  sourceFileFromUrl,
  valueSlug,
  imageOrder,
  parseSwatchFileName,
  planSwatches,
} from "../lib/image-files";

describe("parseImageFileName", () => {
  it("acepta handle_XX con .jpg y .jpeg (sin distinguir mayúsculas)", () => {
    expect(parseImageFileName("mock-taza-esencial-002_01.jpg")).toEqual({
      file: "mock-taza-esencial-002_01.jpg",
      handle: "mock-taza-esencial-002",
      value: null,
      position: 1,
    });
    expect(parseImageFileName("/fotos/Camiseta-Roja_12.JPEG")).toMatchObject({
      handle: "camiseta-roja",
      position: 12,
    });
  });

  it("rechaza nombres fuera de la convención", () => {
    for (const name of [
      "camiseta_1.jpg",
      "camiseta_001.jpg",
      "camiseta_00.jpg",
      "camiseta-01.jpg",
      "camiseta_01.png",
      "camiseta 01.jpg",
      "-camiseta_01.jpg",
      "_01.jpg",
    ]) {
      expect(parseImageFileName(name)).toBeNull();
    }
  });
});

describe("planProductImages", () => {
  it("agrupa por handle, ordena por posición e informa ignorados y duplicados", () => {
    const plan = planProductImages([
      "b_02.jpg",
      "a_03.jpg",
      "a_01.jpg",
      "notas.txt",
      "b_01.jpg",
      "b_02.jpeg",
    ]);
    expect(plan.products.map((p) => [p.handle, p.files.map((f) => f.position)])).toEqual([
      ["a", [1, 3]],
      ["b", [1, 2]],
    ]);
    expect(plan.ignored).toEqual(["notas.txt"]);
    expect(plan.duplicates).toEqual(["b_02.jpeg"]);
  });
});

describe("imageOrder (Fase H)", () => {
  it("generales por posición y después las de cada valor", () => {
    const list = [
      { value: "rojo", position: 1 },
      { value: null, position: 9 },
      { value: null, position: 1 },
      { value: "azul", position: 2 },
      { value: "azul", position: 1 },
    ];
    expect(list.sort(imageOrder)).toEqual([
      { value: null, position: 1 },
      { value: null, position: 9 },
      { value: "azul", position: 1 },
      { value: "azul", position: 2 },
      { value: "rojo", position: 1 },
    ]);
  });
});

describe("sourceFileFromUrl", () => {
  it("deduce handle_XX.ext de la clave de file-s3 (<nombre>-<ULID><ext>)", () => {
    expect(
      sourceFileFromUrl(
        "http://localhost:8333/medusa/mock-taza-002_03-01M40RG1V4WNCNZFJ28778C6DT.jpg",
      ),
    ).toBe("mock-taza-002_03.jpg");
    expect(
      sourceFileFromUrl("https://img.x.com/p/Camiseta_01-01M40RG1V4WNCNZFJ28778C6DT.JPEG"),
    ).toBe("camiseta_01.jpeg");
  });

  it("null si no sigue la convención (p. ej. subida manual desde el Admin)", () => {
    expect(
      sourceFileFromUrl("http://x/medusa/foto-tienda-01M40RG1V4WNCNZFJ28778C6DT.jpg"),
    ).toBeNull();
    expect(sourceFileFromUrl("http://x/medusa/mock-taza-002_03.jpg")).toBeNull();
  });
});

describe("fotos de un valor de opción (Fase O)", () => {
  it("handle--valor_XX: separa el valor; sin él, foto general", () => {
    expect(parseImageFileName("arnes-estampado--rayas-azules_02.jpg")).toEqual({
      file: "arnes-estampado--rayas-azules_02.jpg",
      handle: "arnes-estampado",
      value: "rayas-azules",
      position: 2,
    });
    expect(parseImageFileName("arnes-estampado_01.jpg")).toMatchObject({
      handle: "arnes-estampado",
      value: null,
    });
    expect(parseImageFileName("arnes---rayas_01.jpg")).toBeNull();
    expect(parseImageFileName("arnes--_01.jpg")).toBeNull();
  });

  it("generales primero; luego por valor y posición; misma posición en otro valor no es duplicado", () => {
    const plan = planProductImages(["a--rayas_01.jpg", "a_02.jpg", "a--flores_01.jpg", "a_01.jpg"]);
    expect(plan.products[0]!.files.map((f) => f.file)).toEqual([
      "a_01.jpg",
      "a_02.jpg",
      "a--flores_01.jpg",
      "a--rayas_01.jpg",
    ]);
    expect(plan.duplicates).toEqual([]);
  });

  it("valueSlug y nombre recuperado de la URL", () => {
    expect(valueSlug("Rayas Azules")).toBe("rayas-azules");
    expect(valueSlug("Corazón · Rosa")).toBe("corazon-rosa");
    expect(
      sourceFileFromUrl("http://x/medusa/arnes--flores_01-01M40RG1V4WNCNZFJ28778C6DT.jpg"),
    ).toBe("arnes--flores_01.jpg");
  });
});

describe("muestras de color (fase 13)", () => {
  it("handle--valor_muestra.png|webp; no son fotos de la galería ni «ignoradas»", () => {
    expect(parseSwatchFileName("Arnes--Sea-Foam_muestra.PNG")).toEqual({
      file: "Arnes--Sea-Foam_muestra.PNG",
      handle: "arnes",
      value: "sea-foam",
    });
    expect(parseSwatchFileName("arnes--rojo_muestra.webp")?.value).toBe("rojo");
    for (const f of ["arnes_muestra.png", "arnes--rojo_muestra.jpg", "arnes--rojo_01.png"]) {
      expect(parseSwatchFileName(f)).toBeNull();
    }
    const plan = planProductImages(["arnes_01.jpg", "arnes--rojo_muestra.png", "otra.txt"]);
    expect(plan.ignored).toEqual(["otra.txt"]);
    expect(plan.products[0]!.files.map((f) => f.file)).toEqual(["arnes_01.jpg"]);
  });

  it("una por producto y valor; la repetida, aparte", () => {
    expect(
      planSwatches(["b--rojo_muestra.webp", "a--azul_muestra.png", "b--rojo_muestra.png"]),
    ).toEqual({
      swatches: [
        { file: "a--azul_muestra.png", handle: "a", value: "azul" },
        { file: "b--rojo_muestra.png", handle: "b", value: "rojo" },
      ],
      duplicates: ["b--rojo_muestra.webp"],
    });
  });
});
