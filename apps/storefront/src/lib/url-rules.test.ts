// Reglas de URL de la tienda (Fase E, docs/fases/faseE-urls-correas.md §E-1). Lee el árbol de
// src/pages y public/ (sin Astro): un primer segmento nuevo en la raíz no puede chocar con los
// prefijos reservados ni con las páginas de contenido, y las redirecciones tienen que ser válidas.
// Astro da prioridad a la ruta de FICHERO sobre una redirección (astro-docs: routing «Route
// Priority Order»), sin avisar: por eso se comprueba aquí.
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CORREA_GROUP_HANDLE } from "./correa";
import { REDIRECTS, redirectErrors } from "./redirects.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const names = (dir: string) => readdirSync(new URL(dir, `file://${ROOT}`)).sort();
const segment = (file: string) => file.replace(/\.(astro|ts|md|mdx|html)$/, "");

/** Primer segmento de las URL que genera src/pages (sin las de Astro, `404`). */
const pageSegments = names("pages/").map(segment);
/** Ficheros y carpetas de public/ (también ocupan la raíz). */
const publicSegments = names("../public/");
/** Páginas de contenido (Content Collection `paginas`): /<id>/. */
const contentSegments = names("content/paginas/").map(segment);

/**
 * Prefijos reservados para el futuro (no se pueden usar como página de la raíz):
 * - `blog`: blog (Content Collections, tras la apertura).
 * - `ca`, `eu`, `gl`: idiomas cooficiales (i18n de Astro con `prefixDefaultLocale: false`; el
 *   castellano sigue sin prefijo).
 */
const RESERVED = ["blog", "ca", "eu", "gl"];

describe("reglas de URL", () => {
  it("ninguna página de la raíz usa un prefijo reservado", () => {
    for (const s of [...pageSegments, ...publicSegments, ...contentSegments]) {
      expect(RESERVED, `«/${s}/» es un prefijo reservado`).not.toContain(s);
    }
  });

  it("las páginas de contenido no chocan con public/ y cada una tiene su página", () => {
    for (const s of contentSegments) expect(publicSegments).not.toContain(s);
    // Hoy cada entrada de `paginas` tiene su .astro (sobre-nosotros.astro). Si se pasa a una
    // ruta dinámica /[pagina]/, este test debe comprobar que ningún id coincide con una ruta.
    expect(contentSegments.filter((s) => !pageSegments.includes(s))).toEqual([]);
  });

  it("src/pages y public/ no comparten primer segmento", () => {
    expect(pageSegments.filter((s) => publicSegments.includes(s))).toEqual([]);
  });

  it("singular/plural del catálogo: /producto/, /productos/ y /categoria/ (no /categorias/)", () => {
    expect(pageSegments).toEqual(expect.arrayContaining(["producto", "productos", "categoria"]));
    expect(pageSegments).not.toContain("categorias");
  });

  it("/producto/: solo la ficha dinámica y la página de grupo de la correa (handle reservado)", () => {
    // Una página fija en /producto/ tapa a un producto con ese handle (gana la ruta estática):
    // cada una se reserva también en el backend (RESERVED_PRODUCT_HANDLES de catalog-sheet.ts).
    expect(names("pages/producto/").map(segment)).toEqual(["[handle]", CORREA_GROUP_HANDLE]);
  });

  it("las redirecciones son válidas y ninguna queda tapada por una página", () => {
    expect(redirectErrors(REDIRECTS)).toEqual([]);
    for (const from of Object.keys(REDIRECTS)) {
      const first = from.split("/")[1]!;
      expect(pageSegments, `«${from}» la tapa src/pages/${first}`).not.toContain(first);
    }
  });

  it("redirectErrors detecta errores de formato", () => {
    expect(
      redirectErrors({
        "/a/": "/b",
        "/c": "/c",
        "/d/[x]": "/e",
        "/f": "/g",
        "/g": "/h",
      }),
    ).toEqual([
      "Origen no válido: «/a/» (ruta sin «/» final).",
      "«/c» redirige a sí misma.",
      "«/d/[x]» → «/e»: los dos lados necesitan los mismos parámetros.",
      "Cadena de redirecciones: «/g».",
    ]);
  });
});
