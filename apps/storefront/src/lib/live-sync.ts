// Corrección "en vivo" de precio y stock (patrón build + server island, fase 6, modo C).
// El HTML estático ya trae precio y stock del build. La server island invisible <LiveSyncData>
// devuelve SOLO datos (un <template data-live-sync> con JSON, inerte: ni ejecuta ni aplica
// estilos) y el script estático LIVE_SYNC_APPLY (mismo contenido en todas las páginas → un único
// hash para la CSP) los aplica al llegar:
//   - stock → cambia data-stock / data-vstock; las reglas de global.css muestran/ocultan
//     [data-if-stock] / [data-if-vstock] y atenúan [data-dim].
//   - precio → actualiza el texto de [data-price="<id>"] y el "Desde" ([data-price-from="<id>"]).
// Marcado esperado (ver ProductCard.astro / BuyBox.astro):
//   <article data-pid="prod_…" data-stock="in|out"> … <span data-if-stock="out">Agotado</span>
//   <tr data-pid="variant_…" data-vstock="in|out"> … <span data-if-vstock="in">Disponible</span>
//   <span data-price-from="prod_…">Desde</span> <span data-price="prod_…">4,95 €</span>
import { getProductPricing, type StoreProduct } from "./catalog";
import { formatPrice } from "./format";

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
}

export function liveEntries(products: StoreProduct[]): LiveEntry[] {
  const out: LiveEntry[] = [];
  for (const product of products) {
    const pricing = getProductPricing(product);
    const currency = pricing.currencyCode;
    const fmt = (amount: number | null) =>
      amount != null && currency ? formatPrice(amount, currency) : null;
    out.push({
      id: product.id,
      level: "product",
      inStock: pricing.inStock,
      price: fmt(pricing.fromAmount),
      range: pricing.hasPriceRange,
    });
    for (const v of pricing.variants) {
      out.push({ id: v.id, level: "variant", inStock: v.inStock, price: fmt(v.amount) });
    }
  }
  return out.filter((e) => SAFE_ID.test(e.id));
}

/** Datos de la island: id → [precio | null, rango 0|1, stock 0|1], seguro dentro de HTML. */
export function liveData(entries: LiveEntry[]): string {
  const map: Record<string, [string | null, 0 | 1, 0 | 1]> = {};
  for (const e of entries) map[e.id] = [e.price, e.range ? 1 : 0, e.inStock ? 1 : 0];
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
  "if(v)e.hidden=!v[1]}return 1};" +
  "a()||new MutationObserver((_,o)=>a()&&o.disconnect()).observe(p,{childList:true})}";
