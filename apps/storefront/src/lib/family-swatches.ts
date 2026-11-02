/**
 * Punto de color de las familias en los filtros (Fase FO). La CSP no deja `style="…"` (AGENTS
 * §3.2): cada color es una CLASE (`fam-c-2f6fd1`) y su regla va en un `<style>` del `<head>`
 * (HeadStyle, con su hash) SOLO en las páginas con filtros: nada en el CSS común (se descarga en
 * todas las páginas). El color viene validado (`#rrggbb`, lib/option-families.ts), así que
 * la clase y la regla no pueden inyectar nada. Sin color (p. ej. «Multicolor», tallas): un
 * círculo con un degradado de varios colores o vacío, sin regla propia.
 * Funciones PURAS (Vitest).
 */
import type { FamilyCatalog, ListingFacets } from "./facets";

const HEX = /^#([0-9a-f]{6})$/;

/** Clase del punto: `fam-c-<hex>` o, sin color, `fam-c-none`. */
export function swatchClass(color: string | null | undefined): string {
  const m = color ? HEX.exec(color.toLowerCase()) : null;
  return m ? `fam-c-${m[1]}` : "fam-c-none";
}

/** Reglas de unos colores (`#rrggbb` validados), sin repetir y en orden estable. */
function rules(colors: Iterable<string | null | undefined>): string {
  const hexes = new Set<string>();
  for (const c of colors) {
    const m = c ? HEX.exec(c.toLowerCase()) : null;
    if (m) hexes.add(m[1]!);
  }
  return [...hexes]
    .sort()
    .map((hex) => `.fam-c-${hex}{--fam:#${hex}}`)
    .join("");
}

/**
 * Reglas de los colores de un panel (listados estáticos), para HeadStyle: solo las de las
 * familias que muestra. Vacío si no hay.
 */
export const swatchCss = (facets: ListingFacets | null | undefined): string =>
  rules(
    (facets?.groups ?? []).flatMap((g) =>
      g.key === "familia" ? g.values.map((v) => v.color) : [],
    ),
  );

/**
 * Reglas de TODAS las familias del catálogo (/buscar/): SearchLive cambia el panel sin recargar
 * y un <style> nuevo del fragmento no se aplicaría (CSP), así que la página trae de entrada las
 * de cualquier panel posible (las familias del manifiesto del build).
 */
export const catalogSwatchCss = (catalog: FamilyCatalog | null | undefined): string =>
  rules([...(catalog?.values() ?? [])].flat().map((f) => f.color));
