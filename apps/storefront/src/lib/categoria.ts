// Datos comunes de la página de categoría (Fase DS): los prepara pages/categoria/[handle]/
// [...page].astro y los recibe el diseño elegido (src/disenos/categoria/*.astro).
import type { Page } from "astro";
import type { StoreProduct } from "./catalog";
import type { CategoryLink } from "./categories";
import type { CategoryDesignId } from "./disenos";
import type { ListingFacets } from "./facets";
import type { Crumb } from "./ficha";

export interface CategoriaData {
  design: CategoryDesignId;
  page: Page<StoreProduct>;
  facets: ListingFacets;
  category: {
    handle: string;
    name: string;
    description: string;
    /** Fase F: hijas o, en una hoja, hermanas. */
    row: CategoryLink[];
    hasChildren: boolean;
  };
  crumbs: Crumb[];
  /** Props de BaseLayout. */
  seo: { title: string; description: string; jsonLd: Record<string, unknown>[] };
}
