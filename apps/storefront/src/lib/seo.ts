// Constructores de JSON-LD (schema.org). Puros: testeables.
import { getProductPricing, variantNet, type StoreProduct, type StoreVariant } from "./catalog";
import { richTextPlain } from "./rich-text";

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

/** Precios y stock de la ficha (lib/catalog `getProductPricing`, del build). */
type Pricing = ReturnType<typeof getProductPricing>;
const AVAILABILITY = {
  in: "https://schema.org/InStock",
  out: "https://schema.org/OutOfStock",
} as const;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Oferta de una variante (Google, merchant listing: `Offer` con `price` > 0, `priceCurrency`,
 * `availability`, `itemCondition`, `url`). En oferta, el precio activo en `price` y el anterior
 * como `StrikethroughPrice`. €/kg o €/l como `UnitPriceSpecification.referenceQuantity`.
 * Granel: el precio del mínimo (lo que se paga como poco), igual que la ficha.
 */
function variantOffer(
  v: Pricing["variants"][number],
  variant: StoreVariant | undefined,
  currency: string,
  url: string,
) {
  if (v.amount === null || v.amount <= 0) return null;
  const net = variant ? variantNet(variant) : null;
  const specs: Record<string, unknown>[] = [];
  if (v.wasAmount !== null) {
    specs.push({
      "@type": "UnitPriceSpecification",
      priceType: "https://schema.org/StrikethroughPrice",
      price: round2(v.wasAmount),
      priceCurrency: currency,
    });
  }
  if (net && !v.bulk) {
    specs.push({
      "@type": "UnitPriceSpecification",
      price: round2(v.amount),
      priceCurrency: currency,
      referenceQuantity: {
        "@type": "QuantitativeValue",
        value: net.amount,
        unitCode: net.unit === "g" ? "GRM" : "MLT",
        valueReference: {
          "@type": "QuantitativeValue",
          value: 1000,
          unitCode: net.unit === "g" ? "GRM" : "MLT",
        },
      },
    });
  }
  return {
    "@type": "Offer",
    url,
    price: round2(v.amount),
    priceCurrency: currency,
    availability: v.inStock ? AVAILABILITY.in : AVAILABILITY.out,
    itemCondition: "https://schema.org/NewCondition",
    ...(specs.length ? { priceSpecification: specs } : {}),
  };
}

/**
 * Foto propia de cada variante (la primera que no comparten todas: Medusa da a cada variante sus
 * fotos MÁS las generales, Fase O). Sin foto propia, no está en el mapa (se usa la del producto).
 */
function variantImages(product: StoreProduct): Map<string, string> {
  type Img = { url?: string | null; rank?: number | null } | null;
  const lists = (product.variants ?? []).map((v) => ({
    id: v.id,
    urls: ((v as { images?: Img[] | null }).images ?? [])
      .filter((i): i is { url: string; rank?: number | null } => Boolean(i?.url))
      .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
      .map((i) => i.url),
  }));
  const shared = new Set(
    (lists[0]?.urls ?? []).filter((u) => lists.every((l) => l.urls.includes(u))),
  );
  const out = new Map<string, string>();
  for (const l of lists) {
    const own = l.urls.find((u) => !shared.has(u));
    if (own) out.set(l.id, own);
  }
  return out;
}

/** Valores de las opciones de una variante («Talla: M», «Color: Rojo»), sin «Formato: Única». */
function variantOptions(variant: StoreVariant | undefined) {
  return (variant?.options ?? [])
    .map((o) => ({ title: o?.option?.title ?? "", value: o?.value ?? "" }))
    .filter((o) => o.title && o.value && !(o.title === "Formato" && o.value === "Única"));
}

const SCHEMA_PROPERTY: Record<string, string> = {
  talla: "size",
  tamaño: "size",
  color: "color",
  material: "material",
  estampado: "pattern",
};

/**
 * Datos estructurados de la ficha (Google: product snippet + merchant listing).
 * - Una variante: `Product` con su `Offer`.
 * - Varias: `ProductGroup` con un `Product` por variante en `hasVariant`, cada uno con su
 *   `Offer` (Google desaconseja `AggregateOffer` para variantes; product-variants).
 * Precio y stock son los del BUILD: el rebuild automático (fase 13) regenera la ficha a los
 * pocos minutos de un cambio de catálogo. El stock que cambia al vender NO dispara rebuild: la
 * disponibilidad puede ir unos minutos o horas por detrás (aceptado: la fuente de Google Shopping
 * será el feed de Merchant Center). Sin `offers` (o sin el `Product`): descatalogados, productos
 * configurables (correa, caja: el precio depende de lo que se elige) y sin precio.
 */
export function productJsonLd(
  product: StoreProduct,
  site: URL | string,
  image?: string,
  { offers = true }: { offers?: boolean } = {},
) {
  const url = new URL(`/producto/${product.handle}/`, site).href;
  const base = {
    name: product.title,
    // Sin marcas de formato (lib/rich-text.ts): schema.org `description` es texto
    ...(product.description ? { description: richTextPlain(product.description) } : {}),
    url,
    ...(image ? { image: new URL(image, site).href } : {}),
    ...(product.categories?.[0] ? { category: product.categories[0].name } : {}),
    brand: {
      "@type": "Brand",
      name:
        typeof product.metadata?.["marca"] === "string" && product.metadata["marca"]
          ? product.metadata["marca"]
          : "El Rincón de Hiro",
    },
  };
  const pricing = getProductPricing(product);
  const currency = (pricing.currencyCode ?? "eur").toUpperCase();
  const variants = new Map((product.variants ?? []).map((v) => [v.id, v]));
  const priced = offers ? pricing.variants.filter((v) => v.amount !== null && v.amount > 0) : [];
  const ownImage = variantImages(product);

  if (priced.length <= 1) {
    const v = priced[0];
    const variant = v ? variants.get(v.id) : undefined;
    const offer = v ? variantOffer(v, variant, currency, url) : null;
    return {
      "@context": "https://schema.org",
      "@type": "Product",
      ...base,
      ...(variant?.sku ? { sku: variant.sku } : {}),
      ...(offer ? { offers: offer } : {}),
    };
  }

  const varies = new Set<string>();
  const hasVariant = priced.map((v) => {
    const variant = variants.get(v.id);
    const opts = variantOptions(variant);
    const props: Record<string, string> = {};
    for (const o of opts) {
      const key = SCHEMA_PROPERTY[o.title.toLowerCase()];
      if (key) {
        props[key] = o.value;
        varies.add(`https://schema.org/${key}`);
      }
    }
    // Google (merchant listing) exige `image` en CADA variante; recomienda `description`
    const img = ownImage.get(v.id) ?? image;
    return {
      "@type": "Product",
      name: opts.length
        ? `${product.title} — ${opts.map((o) => o.value).join(" / ")}`
        : product.title,
      ...(base.description ? { description: base.description } : {}),
      ...(img ? { image: new URL(img, site).href } : {}),
      ...(variant?.sku ? { sku: variant.sku } : {}),
      ...props,
      offers: variantOffer(v, variant, currency, url),
    };
  });
  return {
    "@context": "https://schema.org",
    "@type": "ProductGroup",
    ...base,
    productGroupID: product.handle,
    ...(varies.size ? { variesBy: [...varies] } : {}),
    hasVariant,
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
