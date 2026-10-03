// Corrección "en vivo" de precio y stock (patrón build + server island, fase 6).
// El HTML estático ya trae precio y stock del build. Una server island invisible, al final de
// la página, devuelve lo mínimo para corregirlo:
//   - stock → un <style> (sin JS) que muestra/oculta los elementos [data-if-stock] /
//     [data-if-vstock] y atenúa [data-dim] por id de producto/variante.
//   - precio → un <script> inline mínimo que actualiza el texto de [data-price="<id>"] y el
//     prefijo "Desde" ([data-price-from="<id>"]).
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

const sel = (ids: string[], attr: string, child: string) =>
  `:is(${ids.map((id) => `[data-pid="${id}"]`).join(",")})[${attr}] ${child}`;

/** CSS de stock. Especificidad (0,3,0) > reglas base de global.css (0,2,0). */
export function liveStockCss(entries: LiveEntry[]): string {
  const rules: string[] = [];
  for (const [level, attr, child] of [
    ["product", "data-stock", "data-if-stock"],
    ["variant", "data-vstock", "data-if-vstock"],
  ] as const) {
    const inIds = entries.filter((e) => e.level === level && e.inStock).map((e) => e.id);
    const outIds = entries.filter((e) => e.level === level && !e.inStock).map((e) => e.id);
    if (inIds.length) {
      rules.push(`${sel(inIds, attr, `[${child}="out"]`)}{display:none}`);
      rules.push(`${sel(inIds, attr, `[${child}="in"]`)}{display:revert-layer}`);
      if (level === "product") rules.push(`${sel(inIds, attr, "[data-dim]")}{opacity:1}`);
    }
    if (outIds.length) {
      rules.push(`${sel(outIds, attr, `[${child}="in"]`)}{display:none}`);
      rules.push(`${sel(outIds, attr, `[${child}="out"]`)}{display:revert-layer}`);
      if (level === "product") rules.push(`${sel(outIds, attr, "[data-dim]")}{opacity:.6}`);
    }
  }
  return rules.join("");
}

/** Script de precios: mapa id → [texto, rango] y bucle mínimo. JSON escapado para <script>. */
export function livePriceScript(entries: LiveEntry[]): string {
  const map: Record<string, [string, 0 | 1]> = {};
  for (const e of entries) {
    if (e.price) map[e.id] = [e.price, e.range ? 1 : 0];
  }
  if (!Object.keys(map).length) return "";
  const json = JSON.stringify(map).replace(/</g, "\\u003c");
  return (
    `{const m=${json};` +
    `for(const e of document.querySelectorAll("[data-price]")){const v=m[e.dataset.price];` +
    `if(v&&e.textContent!==v[0])e.textContent=v[0]}` +
    `for(const e of document.querySelectorAll("[data-price-from]")){const v=m[e.dataset.priceFrom];` +
    `if(v)e.hidden=!v[1]}}`
  );
}
