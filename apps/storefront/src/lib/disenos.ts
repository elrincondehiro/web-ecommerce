/**
 * Diseños de ficha y de categoría (Fase DS, docs/fases/faseDS-disenos.md).
 *
 * Un diseño es el componente `.astro` que pinta la página ENTERA (storefront: src/disenos/). Aquí
 * solo están sus ids, sus propiedades y las reglas para elegirlo, sin componentes:
 *
 *   product.metadata.diseno            diseño de la ficha del producto
 *   category.metadata.diseno           diseño de la página de la categoría (no se hereda)
 *   category.metadata.diseno_productos diseño de las fichas de sus productos y de los de sus
 *                                      subcategorías (si el producto no tiene uno propio)
 *
 * Diseños «de producto» (`heredable: false`): cambian cómo se compra (configurador, datos en vivo
 * propios). Se fijan en el propio producto y NUNCA se heredan: así el código de servidor que no
 * pinta la ficha (búsqueda, deseos, sugerencias del carrito, LiveSync) solo mira la metadata del
 * producto (`productDesign`). Los visuales sí se heredan de la categoría.
 *
 * Funciones PURAS y sin dependencias. ⚠️ Este fichero existe IGUAL en el storefront
 * (apps/storefront/src/lib/disenos.ts) y en el backend (apps/backend/src/lib/disenos.ts: hoja del
 * catálogo y widget del Admin); los tests comprueban que son idénticos. Cambia los dos a la vez.
 */

export const DESIGN_KEY = "diseno";
export const PRODUCTS_DESIGN_KEY = "diseno_productos";
export const DEFAULT_DESIGN = "estandar";

export interface ProductDesignInfo {
  /** Nombre en el Admin. */
  nombre: string;
  /** Para qué sirve (ayuda del Admin). */
  descripcion: string;
  /** Lo escribe un script (no la hoja ni el Admin): p. ej. `correa` lo pone `correas:sync`. */
  reservado: boolean;
  /** Se puede heredar de la categoría (`diseno_productos`). Los de producto, no. */
  heredable: boolean;
  /** Pinta el selector de opciones de la Fase O (radios por opción). */
  selector: boolean;
  /** Pinta la plantilla y la guía de tallas de la Fase O. */
  guias: boolean;
  /**
   * Hay que configurarlo en su ficha: no se añade desde la lista de deseos, las sugerencias del
   * carrito ni los relacionados.
   */
  configurable: boolean;
  /** Texto del botón de la tarjeta (listados) cuando no se puede añadir desde ella. */
  elegir: string | null;
  /** Datos en vivo propios en LiveSync (además de precio y stock). */
  live: "correa" | null;
}

export interface CategoryDesignInfo {
  nombre: string;
  descripcion: string;
}

export const PRODUCT_DESIGNS = {
  estandar: {
    nombre: "Estándar",
    descripcion:
      "Galería, compra (tabla o selector de opciones), guías, descripción y relacionados.",
    reservado: false,
    heredable: true,
    selector: true,
    guias: true,
    configurable: false,
    elegir: null,
    live: null,
  },
  correa: {
    nombre: "Correa a medida",
    descripcion: "Configurador de largo y mosquetones. Lo pone correas:sync.",
    reservado: true,
    heredable: false,
    selector: false,
    guias: false,
    configurable: true,
    elegir: "Elegir medida",
    live: "correa",
  },
} as const satisfies Record<string, ProductDesignInfo>;

export const CATEGORY_DESIGNS = {
  estandar: {
    nombre: "Estándar",
    descripcion: "Título, fila de categorías, filtros y rejilla de productos paginada.",
  },
} as const satisfies Record<string, CategoryDesignInfo>;

export type ProductDesignId = keyof typeof PRODUCT_DESIGNS;
export type CategoryDesignId = keyof typeof CATEGORY_DESIGNS;

type Meta = Record<string, unknown> | null | undefined;

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

// `Object.prototype.hasOwnProperty`: el backend compila a ES2021 (sin `Object.hasOwn`)
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
export const isProductDesign = (id: string): id is ProductDesignId => own(PRODUCT_DESIGNS, id);
export const isCategoryDesign = (id: string): id is CategoryDesignId => own(CATEGORY_DESIGNS, id);

/** Diseño propio del producto (metadata), sin validar; null si no tiene. */
export function ownProductDesign(metadata: Meta): string | null {
  return str(metadata?.[DESIGN_KEY]);
}

/** Problema de un id de diseño de ficha en la metadata de un producto (null = válido o vacío). */
export function productDesignError(id: string | null): string | null {
  if (!id) return null;
  if (!isProductDesign(id)) return `el diseño de ficha «${id}» no existe`;
  return null;
}

/**
 * Problema de los diseños de una categoría (null = válidos o vacíos). `diseno_productos` solo
 * admite diseños heredables.
 */
export function categoryDesignError(metadata: Meta): string | null {
  const page = str(metadata?.[DESIGN_KEY]);
  if (page && !isCategoryDesign(page)) return `el diseño de categoría «${page}» no existe`;
  const products = str(metadata?.[PRODUCTS_DESIGN_KEY]);
  if (products) {
    if (!isProductDesign(products)) return `el diseño de ficha «${products}» no existe`;
    if (!PRODUCT_DESIGNS[products].heredable) {
      return `el diseño «${products}» es de producto: no se hereda de la categoría`;
    }
  }
  return null;
}

/**
 * Diseño de la ficha (build): el del producto → el `diseno_productos` de su categoría más
 * concreta y de sus padres, hacia arriba → `estandar`. `path` = raíz → categoría del producto.
 * Lanza si algún id no existe o no se puede heredar (el build falla con el producto y el valor).
 */
export function resolveProductDesign(
  product: { handle: string; metadata?: Meta },
  path: readonly { handle: string; metadata?: Meta }[] | null,
): ProductDesignId {
  const own = ownProductDesign(product.metadata);
  if (own) {
    const error = productDesignError(own);
    if (error) throw new Error(`Producto «${product.handle}»: ${error} (lib/disenos.ts).`);
    return own as ProductDesignId;
  }
  for (const node of [...(path ?? [])].reverse()) {
    const error = categoryDesignError(node.metadata);
    if (error) throw new Error(`Categoría «${node.handle}»: ${error} (lib/disenos.ts).`);
    const inherited = str(node.metadata?.[PRODUCTS_DESIGN_KEY]);
    if (inherited) return inherited as ProductDesignId;
  }
  return DEFAULT_DESIGN;
}

/** Diseño de la página de una categoría (build). Sin herencia entre categorías. Lanza si no existe. */
export function resolveCategoryDesign(category: {
  handle: string;
  metadata?: Meta;
}): CategoryDesignId {
  const error = categoryDesignError(category.metadata);
  if (error) throw new Error(`Categoría «${category.handle}»: ${error} (lib/disenos.ts).`);
  return (str(category.metadata?.[DESIGN_KEY]) as CategoryDesignId | null) ?? DEFAULT_DESIGN;
}

/**
 * Propiedades del diseño de un producto en el SERVIDOR (búsqueda, deseos, carrito, LiveSync):
 * solo su metadata (los diseños de producto no se heredan). Un id desconocido → estándar (el
 * build ya habría fallado).
 */
export function productDesign(product: { metadata?: Meta }): ProductDesignInfo {
  const own = ownProductDesign(product.metadata);
  return own && isProductDesign(own) ? PRODUCT_DESIGNS[own] : PRODUCT_DESIGNS[DEFAULT_DESIGN];
}
