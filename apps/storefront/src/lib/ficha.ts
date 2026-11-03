// Datos comunes de la ficha (Fase DS): los prepara UNA vez pages/producto/[handle].astro y los
// recibe el diseño elegido (src/disenos/producto/*.astro) y su esqueleto (FichaLayout.astro).
import type { StoreProduct } from "./catalog";
import type { CategoryNode } from "./categories";
import type { ProductDesignId } from "./disenos";
import type { VariantPicker } from "./variant-picker";

export interface Crumb {
  name: string;
  href: string;
}

export interface FichaData {
  product: StoreProduct;
  design: ProductDesignId;
  /** Categoría más concreta del producto (migas, plantilla, «Ver más en…»). */
  category: CategoryNode | null;
  crumbs: Crumb[];
  /** Props de BaseLayout (título, descripción, imagen, noindex, JSON-LD). */
  seo: {
    title: string;
    description: string;
    type: "product";
    image: string | undefined;
    noindex: boolean;
    jsonLd: Record<string, unknown>[];
  };
  discontinued: boolean;
  /** Descatalogado: enlace al sustituto, a su categoría o al catálogo. */
  onward: { href: string; text: string };
  /** Selector de opciones (Fase O) con su CSS del <head>, o null (tabla o diseño sin selector). */
  picker: { picker: VariantPicker; headCss: string } | null;
  gallery: { general: string[]; groups: { label: string; images: string[] }[] };
  hasAnalytics: boolean;
  related: StoreProduct[];
  /** Plantilla y guía de tallas (Fase O), o null si el diseño no las pinta. */
  guides: { template: string | null; sizeGuide: string | null };
  /** Otros productos del mismo diseño de producto (correa: los demás colores). */
  siblings: StoreProduct[];
}
