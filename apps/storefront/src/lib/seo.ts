// Constructores de JSON-LD (schema.org). Puros: testeables.
import type { StoreProduct } from "./catalog";

export interface Crumb {
  name: string;
  href: string;
}

export function breadcrumbJsonLd(items: Crumb[], site: URL | string) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: new URL(c.href, site).href,
    })),
  };
}

/**
 * Product SIN `offers`: el HTML es estático y un precio aquí quedaría congelado hasta el
 * siguiente build (Google lo mostraría en resultados enriquecidos aunque hubiera cambiado).
 * Se añadirán cuando el HTML se regenere al cambiar el catálogo (rebuild por webhook, fase 13).
 */
export function productJsonLd(product: StoreProduct, site: URL | string, image?: string) {
  const url = new URL(`/producto/${product.handle}/`, site).href;
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    ...(product.description ? { description: product.description } : {}),
    url,
    ...(image ? { image: new URL(image, site).href } : {}),
    ...(product.categories?.[0] ? { category: product.categories[0].name } : {}),
    brand: { "@type": "Brand", name: "El Rincón de Hiro" },
  };
}
