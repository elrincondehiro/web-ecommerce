// Corrección "en vivo" de precio y stock (patrón build + server island, fase 6, modo C).
// El HTML estático ya trae precio y stock del build. La server island invisible <LiveSyncData>
// devuelve SOLO datos (un <template data-live-sync> con JSON, inerte: ni ejecuta ni aplica
// estilos) y el script estático LIVE_SYNC_APPLY (mismo contenido en todas las páginas → un único
// hash para la CSP) los aplica al llegar:
//   - stock → cambia data-stock / data-vstock; las reglas de global.css muestran/ocultan
//     [data-if-stock] / [data-if-vstock] y atenúan [data-dim].
//   - precio → actualiza el texto de [data-price="<id>"] y el "Desde" ([data-price-from="<id>"]);
//   - oferta (I-Interficie) → muestra/oculta [data-was-box="<id>"] (precio tachado y descuento)
//     y actualiza [data-was="<id>"] (precio anterior) y [data-off="<id>"] ("−20 %");
//   - precio por kilo/litro (Fase S, S-2) → actualiza [data-unit="<id>"] ("12,65 €/kg");
//   - granel (S-3) → actualiza [data-left="<variante>"] ("Quedan 2,4 kg", CATALOG_FEATURES).
// Marcado esperado (ver ProductCard.astro / BuyBox.astro):
//   <article data-pid="prod_…" data-stock="in|out"> … <span data-if-stock="out">Agotado</span>
//   <tr data-pid="variant_…" data-vstock="in|out"> … <span data-if-vstock="in">Disponible</span>
//   <span data-price-from="prod_…">Desde</span> <span data-price="prod_…">4,95 €</span>
//   <span data-was-box="prod_…" hidden><del data-was="prod_…">5,95 €</del>
//     <span data-off="prod_…">−20 %</span></span>
import {
  discountPercent,
  getProductPricing,
  type StoreProduct,
  type UnitPrice,
  type VariantAvailability,
} from "./catalog";
import { formatStockGrams } from "./bulk";
import { correaLiveData, correaModel, type CorreaLiveData } from "./correa";
import { CATALOG_FEATURES } from "./constants";
import { formatDiscount, formatPrice, formatUnitPrice } from "./format";

const SAFE_ID = /^[A-Za-z0-9_-]+$/;

export interface LiveEntry {
  id: string;
  /** "product" usa data-stock; "variant" usa data-vstock. */
  level: "product" | "variant";
  inStock: boolean;
  /** Precio formateado o null si no hay precio. */
  price: string | null;
  /** Solo productos: true si hay varios precios ("Desde"). */
  range?: boolean;
  /** Precio anterior formateado si está rebajado (oferta), o null. */
  was?: string | null;
  /** Descuento formateado ("−20 %"), o null. */
  off?: string | null;
  /** Precio por kilo/litro formateado ("12,65 €/kg"), o null. */
  unit?: string | null;
  /** Solo variantes a granel: stock que queda ("Quedan 2,4 kg"), o null. */
  left?: string | null;
}

/** «Quedan 2,4 kg» de una variante a granel con stock limitado (o null). */
export function stockLeftText(v: VariantAvailability): string | null {
  if (!CATALOG_FEATURES.bulkStockLeft || !v.bulk || v.bulk.stockG === null || !v.inStock) {
    return null;
  }
  return `Quedan ${formatStockGrams(v.bulk.stockG)}`;
}

export interface LiveEntriesOptions {
  /**
   * Entradas por variante (ficha: tabla de variantes, «Quedan», €/kg de la elegida). Los
   * listados solo pintan tarjetas (`ProductCard`: marcas por producto), así que van sin ellas
   * (`false`): la respuesta deja de crecer con el número de variantes (perf L-1).
   */
  variants?: boolean;
}

export function liveEntries(
  products: StoreProduct[],
  { variants = true }: LiveEntriesOptions = {},
): LiveEntry[] {
  const out: LiveEntry[] = [];
  for (const product of products) {
    const pricing = getProductPricing(product);
    const currency = pricing.currencyCode;
    const fmt = (amount: number | null) =>
      amount != null && currency ? formatPrice(amount, currency) : null;
    const off = (now: number | null, was: number | null) =>
      now !== null && was !== null ? formatDiscount(discountPercent(now, was)) : null;
    const unit = (u: UnitPrice | null) =>
      u && currency ? formatUnitPrice(u.amount, currency, u.unit) : null;
    out.push({
      id: product.id,
      level: "product",
      inStock: pricing.inStock,
      price: fmt(pricing.fromAmount),
      range: pricing.hasPriceRange,
      was: fmt(pricing.wasAmount),
      off: off(pricing.fromAmount, pricing.wasAmount),
      unit: unit(pricing.unitPrice),
    });
    if (!variants) continue;
    for (const v of pricing.variants) {
      out.push({
        id: v.id,
        level: "variant",
        inStock: v.inStock,
        price: fmt(v.amount),
        was: fmt(v.wasAmount),
        off: off(v.amount, v.wasAmount),
        unit: unit(v.unitPrice),
        left: stockLeftText(v),
      });
    }
  }
  return out.filter((e) => SAFE_ID.test(e.id));
}

/** Recargo de un mosquetón: «incluido» o «+3,00 €» (build y LiveSync, mismo texto). */
export function surchargeText(amount: number, fmt: (n: number) => string): string {
  return amount > 0 ? `+${fmt(amount)}` : "incluido";
}

/**
 * Ficha de una correa a medida (E-2c): entrada del producto («Desde» y stock) y los datos del
 * configurador (`_correa`, los lee CorreaLive: precios en céntimos y máscaras). Sin entradas por
 * variante (117; la ficha no tiene marcas por variante). Si los precios actuales no cumplen el
 * modelo aditivo (lib/correa.ts), sin `_correa`: el configurador se queda con los del build y el
 * carrito cobra el de Medusa.
 */
export function correaLive(product: StoreProduct): {
  entries: LiveEntry[];
  correa: CorreaLiveData | null;
} {
  const entries = liveEntries([product], { variants: false });
  try {
    return { entries, correa: correaLiveData(product, correaModel(product)) };
  } catch {
    return { entries, correa: null };
  }
}

/**
 * Datos de la island: id → [precio | null, rango 0|1, stock 0|1, anterior?, descuento?, €/kg?,
 * quedan?] (+ `extra`), seguro dentro de HTML. La tupla se corta tras el último dato: sin oferta ni €/kg
 * queda en 3 (v[3] vacío = sin oferta); los huecos anteriores a un dato van a 0.
 */
export function liveData(entries: LiveEntry[], extra?: Record<string, unknown>): string {
  type Tuple = (string | number | null)[];
  // `extra` (E-2c): claves que empiezan por «_» (no son ids de Medusa) para otros scripts,
  // p. ej. `_correa` (datos del configurador, CorreaLive). El aplicador no las mira.
  const map: Record<string, unknown> = { ...extra };
  for (const e of entries) {
    const t: Tuple = [e.price, e.range ? 1 : 0, e.inStock ? 1 : 0];
    const sale = e.was && e.off;
    if (sale || e.unit || e.left) t.push(sale ? e.was! : 0, sale ? e.off! : 0);
    if (e.unit || e.left) t.push(e.unit ?? 0);
    if (e.left) t.push(e.left);
    map[e.id] = t;
  }
  return JSON.stringify(map).replace(/</g, "\\u003c").replace(/&/g, "\\u0026");
}

/**
 * Script estático que aplica los datos. Va junto al hueco de la island (mismo padre) y observa
 * solo ese padre (childList, sin subtree) hasta que Astro inserta el <template>.
 * No editar sin pasar los tests: su hash SHA-256 se añade a la CSP (LiveSync.astro).
 */
export const LIVE_SYNC_APPLY =
  "{const p=document.currentScript.parentNode,d=document,a=()=>{" +
  'const t=p.querySelector("template[data-live-sync]");if(!t)return 0;' +
  "const m=JSON.parse(t.content.textContent);" +
  'for(const e of d.querySelectorAll("[data-pid]")){const v=m[e.dataset.pid];if(!v)continue;' +
  'const s=v[2]?"in":"out";if(e.dataset.stock)e.dataset.stock=s;else if(e.dataset.vstock)e.dataset.vstock=s}' +
  'for(const e of d.querySelectorAll("[data-price]")){const v=m[e.dataset.price];' +
  "if(v&&v[0]&&e.textContent!==v[0])e.textContent=v[0]}" +
  'for(const e of d.querySelectorAll("[data-price-from]")){const v=m[e.dataset.priceFrom];' +
  "if(v)e.hidden=!v[1]}" +
  'for(const e of d.querySelectorAll("[data-was-box]")){const v=m[e.dataset.wasBox];' +
  "if(v)e.hidden=!v[3]}" +
  'for(const[k,i]of[["was",3],["off",4],["unit",5],["left",6]])for(const e of d.querySelectorAll("[data-"+k+"]")){' +
  "const v=m[e.dataset[k]];if(v&&v[i])e.textContent=v[i]}return 1};" +
  "a()||new MutationObserver((_,o)=>a()&&o.disconnect()).observe(p,{childList:true})}";
