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

/**
 * Página de grupo de la correa a medida (E-2c): `ProductGroup` con cada color como `hasVariant`
 * (Product con su URL), `variesBy` color y material. Sin `offers`, como `productJsonLd`.
 */
export function productGroupJsonLd(
  group: { handle: string; title: string; description: string },
  members: StoreProduct[],
  site: URL | string,
) {
  return {
    "@context": "https://schema.org",
    "@type": "ProductGroup",
    name: group.title,
    description: group.description,
    url: new URL(`/producto/${group.handle}/`, site).href,
    productGroupID: group.handle,
    variesBy: ["https://schema.org/color", "https://schema.org/material"],
    brand: { "@type": "Brand", name: "El Rincón de Hiro" },
    hasVariant: members.map((p) => ({
      "@type": "Product",
      name: p.title,
      url: new URL(`/producto/${p.handle}/`, site).href,
      ...(typeof p.metadata?.["color"] === "string" ? { color: p.metadata["color"] } : {}),
      ...(typeof p.metadata?.["material"] === "string" ? { material: p.metadata["material"] } : {}),
    })),
  };
}
