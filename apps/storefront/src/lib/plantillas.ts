// Plantillas de ficha y guías de tallas (Fase O). Funciones PURAS (Vitest); el contenido está en
// las Content Collections `plantillas` y `guias` (src/content.config.ts).
// Orden: `metadata.plantilla` del producto (columna `plantilla` de la hoja) → la primera plantilla
// cuya lista `categorias` contenga la categoría del producto o una de sus ancestras → ninguna.
// La correa a medida (`plantilla = "correa"`) tiene su propia ficha: aquí no cuenta.
import type { StoreProduct } from "./catalog";
import type { CategoryNode } from "./categories";
import { CORREA_TEMPLATE } from "./correa";

export const TEMPLATE_KEY = "plantilla";
export const SIZE_GUIDE_KEY = "guia_tallas";

export interface TemplateRef {
  id: string;
  categorias: readonly string[];
}

const str = (v: unknown) => (typeof v === "string" && v ? v : null);

/** Id de la plantilla de la ficha, o null. Lanza si el producto pide una que no existe. */
export function resolveTemplate(
  product: Pick<StoreProduct, "handle" | "metadata">,
  category: Pick<CategoryNode, "path"> | null,
  templates: readonly TemplateRef[],
): string | null {
  const own = str(product.metadata?.[TEMPLATE_KEY]);
  if (own === CORREA_TEMPLATE) return null;
  if (own) {
    if (!templates.some((t) => t.id === own)) {
      throw new Error(
        `El producto «${product.handle}» usa la plantilla «${own}», que no existe (src/content/plantillas/${own}.md).`,
      );
    }
    return own;
  }
  // De la categoría más concreta hacia la raíz
  for (const node of [...(category?.path ?? [])].reverse()) {
    const hit = templates.find((t) => t.categorias.includes(node.handle));
    if (hit) return hit.id;
  }
  return null;
}

/** Id de la guía de tallas del producto, o null. Lanza si no existe. */
export function resolveSizeGuide(
  product: Pick<StoreProduct, "handle" | "metadata">,
  guides: readonly string[],
): string | null {
  const id = str(product.metadata?.[SIZE_GUIDE_KEY]);
  if (!id) return null;
  if (!guides.includes(id)) {
    throw new Error(
      `El producto «${product.handle}» usa la guía de tallas «${id}», que no existe (src/content/guias/${id}.md).`,
    );
  }
  return id;
}
