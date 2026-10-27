// Árbol de categorías (Fase S, S-1): funciones PURAS sobre la lista plana de la Store API
// (`parent_category_id`), testeables con Vitest. Los productos van solo en la categoría más
// concreta (contrato de catalog:import); la página de un padre muestra los de TODO su
// subárbol. Fuente: context7 /medusajs/medusa (storefront-development/products/categories:
// `parent_category_id`, `category_children`) y @medusajs/medusa 2.21.2
// (api/store/products/middlewares.js: `category_id` NO incluye descendientes → se filtra aquí).
import type { HttpTypes } from "@medusajs/types";
import type { StoreProduct } from "./catalog";

export type StoreCategory = HttpTypes.StoreProductCategory;

export interface CategoryNode {
  id: string;
  handle: string;
  name: string;
  description: string;
  rank: number;
  parentId: string | null;
  /** Metadata de Medusa (Fase H: foto propia `imagen_url`/`imagen_alt`, lib/entity-image.ts). */
  metadata: Record<string, unknown> | null;
  children: CategoryNode[];
  /** Raíz → este nodo (incluido). */
  path: CategoryNode[];
  depth: number;
}

export interface CategoryTree {
  roots: CategoryNode[];
  byId: Map<string, CategoryNode>;
  byHandle: Map<string, CategoryNode>;
  /** Todos los nodos, en orden de recorrido (raíz, hijas por rank, …). */
  all: CategoryNode[];
}

const byRank = (a: CategoryNode, b: CategoryNode) =>
  a.rank - b.rank || a.name.localeCompare(b.name, "es");

/** Árbol a partir de la lista plana. Un padre desconocido convierte al nodo en raíz. */
export function buildCategoryTree(list: StoreCategory[]): CategoryTree {
  const byId = new Map<string, CategoryNode>();
  for (const c of list) {
    if (!c.id || !c.handle) continue;
    byId.set(c.id, {
      id: c.id,
      handle: c.handle,
      name: c.name ?? c.handle,
      description: c.description ?? "",
      rank: c.rank ?? 0,
      parentId: c.parent_category_id ?? null,
      metadata: (c.metadata as Record<string, unknown> | null | undefined) ?? null,
      children: [],
      path: [],
      depth: 0,
    });
  }
  const roots: CategoryNode[] = [];
  for (const n of byId.values()) {
    const parent = n.parentId ? byId.get(n.parentId) : undefined;
    if (parent) parent.children.push(n);
    else {
      n.parentId = null;
      roots.push(n);
    }
  }
  const all: CategoryNode[] = [];
  const walk = (nodes: CategoryNode[], path: CategoryNode[]) => {
    nodes.sort(byRank);
    for (const n of nodes) {
      // Ciclo (no debería pasar: el importador lo rechaza): se corta.
      if (path.includes(n)) continue;
      n.path = [...path, n];
      n.depth = path.length;
      all.push(n);
      walk(n.children, n.path);
    }
  };
  walk(roots, []);
  return { roots, byId, byHandle: new Map(all.map((n) => [n.handle, n])), all };
}

/** Ids del nodo y de todos sus descendientes. */
export function subtreeIds(node: CategoryNode): Set<string> {
  const ids = new Set<string>();
  const stack = [node];
  for (let n = stack.pop(); n; n = stack.pop()) {
    if (ids.has(n.id)) continue;
    ids.add(n.id);
    stack.push(...n.children);
  }
  return ids;
}

/** Productos del subárbol, sin duplicados y en el orden del catálogo. */
export function productsInSubtree(products: StoreProduct[], node: CategoryNode): StoreProduct[] {
  const ids = subtreeIds(node);
  return products.filter((p) => p.categories?.some((c) => c?.id && ids.has(c.id)));
}

/**
 * Categorías con productos en su subárbol (las vacías no tienen página ni salen en menús:
 * Fase S, decisión del usuario). Devuelve un árbol nuevo solo con esas.
 */
export function pruneEmpty(tree: CategoryTree, products: StoreProduct[]): CategoryTree {
  const used = new Set<string>();
  for (const p of products) for (const c of p.categories ?? []) if (c?.id) used.add(c.id);
  const keep = new Set<string>();
  for (const n of tree.all) if (used.has(n.id)) for (const a of n.path) keep.add(a.id);
  return buildCategoryTree(
    tree.all
      .filter((n) => keep.has(n.id))
      .map((n) => ({
        id: n.id,
        handle: n.handle,
        name: n.name,
        description: n.description,
        rank: n.rank,
        parent_category_id: n.parentId,
        metadata: n.metadata,
      })) as StoreCategory[],
  );
}

/** Categoría más profunda de un producto (para las migas de la ficha). */
export function deepestCategory(
  tree: CategoryTree,
  product: Pick<StoreProduct, "categories">,
): CategoryNode | null {
  let best: CategoryNode | null = null;
  for (const c of product.categories ?? []) {
    const n = c?.id ? tree.byId.get(c.id) : undefined;
    if (n && (!best || n.depth > best.depth)) best = n;
  }
  return best;
}

export const categoryHref = (n: Pick<CategoryNode, "handle">) => `/categoria/${n.handle}/`;

/**
 * { handle → nombre } de todo el árbol (chips de filtros y sugerencias, sin contexto). Un nombre
 * repetido («Juguetes» de perro y de gato) lleva el de su raíz: «Juguetes (Gato)».
 */
export function categoryNames(tree: CategoryTree): Map<string, string> {
  const count = new Map<string, number>();
  for (const n of tree.all) count.set(n.name, (count.get(n.name) ?? 0) + 1);
  return new Map(
    tree.all.map((n) => [
      n.handle,
      (count.get(n.name) ?? 0) > 1 && n.depth > 0 ? `${n.name} (${n.path[0]!.name})` : n.name,
    ]),
  );
}

/**
 * Categorías que se ofrecen en el filtro «Categoría» (Fase S, por niveles), en orden del árbol:
 * sin ninguna elegida, las raíces; con alguna, sus hijas (y las elegidas, para poder
 * desmarcarlas). En una hoja elegida, solo ella. `fixed`: la de la página (no se ofrece).
 */
export function facetCategories(
  tree: CategoryTree,
  selected: readonly string[],
  fixed?: string,
): Map<string, string> {
  const chosen = [...selected, ...(fixed ? [fixed] : [])]
    .map((h) => tree.byHandle.get(h))
    .filter((n): n is CategoryNode => Boolean(n));
  const offer = new Set<string>();
  if (!chosen.length) for (const r of tree.roots) offer.add(r.handle);
  for (const n of chosen) {
    if (n.handle !== fixed) offer.add(n.handle);
    for (const c of n.children) offer.add(c.handle);
  }
  return new Map(tree.all.filter((n) => offer.has(n.handle)).map((n) => [n.handle, n.name]));
}

/**
 * Sangría del filtro «Categoría» (Fase F): nivel de cada categoría ofrecida respecto a la menos
 * profunda (0, 1, 2…), así las hijas que aparecen al elegir un padre se ven debajo de él.
 */
export function categoryIndent(tree: CategoryTree, handles: Iterable<string>): Map<string, number> {
  const nodes = [...handles].map((h) => tree.byHandle.get(h)).filter((n): n is CategoryNode => !!n);
  const top = Math.min(...nodes.map((n) => n.depth));
  return new Map(nodes.map((n) => [n.handle, n.depth - top]));
}

/** Handles de las categorías de un producto y de sus ancestros (como `category_tree_handles`). */
export function productTreeHandles(
  tree: CategoryTree,
  product: Pick<StoreProduct, "categories">,
): string[] {
  const out = new Set<string>();
  for (const c of product.categories ?? []) {
    const n = c?.id ? tree.byId.get(c.id) : undefined;
    for (const a of n?.path ?? []) out.add(a.handle);
  }
  return [...out];
}

/**
 * Categorías elegidas que filtran de verdad: se quita la que es antecesora de otra elegida
 * (marcar «Piensos» dentro de «Perro» acota; dentro del grupo los valores van con OR y el padre
 * ya incluye a la hija). Desconocidas: se mantienen (no dan resultados, como antes).
 */
export function narrowCategories(tree: CategoryTree, selected: readonly string[]): string[] {
  const ancestors = new Set<string>();
  for (const h of selected) {
    const n = tree.byHandle.get(h);
    for (const a of n?.path.slice(0, -1) ?? []) ancestors.add(a.handle);
  }
  return selected.filter((h) => !ancestors.has(h));
}

export interface CategoryLink {
  name: string;
  handle: string;
  /** La de la página (fila de hermanas): `aria-current`. */
  current?: boolean;
}

/**
 * Fila de categorías de un listado (Fase F, CategoryNav): siempre hay una, así la rejilla empieza
 * a la misma altura en todas las categorías (sin salto al navegar).
 * - padre → sus hijas;
 * - hoja → sus hermanas (las raíces, si es una raíz sin hijas), con la actual marcada
 *   (`current`); sin hermanas, ella sola marcada: para subir de nivel está la miga de pan
 *   (enseñar los ascendientes confundía y saltaba de nivel);
 * - `/productos/` (`node` null) → las raíces.
 */
export function categoryRow(tree: CategoryTree, node: CategoryNode | null): CategoryLink[] {
  const link = (n: CategoryNode): CategoryLink => ({
    name: n.name,
    handle: n.handle,
    ...(node && n.handle === node.handle ? { current: true } : {}),
  });
  if (!node) return tree.roots.map(link);
  if (node.children.length) return node.children.map(link);
  const parent = node.parentId ? tree.byId.get(node.parentId) : undefined;
  return (parent ? parent.children : tree.roots).map(link);
}
