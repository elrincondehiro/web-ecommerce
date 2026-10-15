# Fase R — Productos relacionados y venta cruzada

> **Estado:** ✅ completada (15-oct-2026)
> **Rama/PR:** `feat/faseR-relacionados` · PR propia. Incluye la rama `docs/analisis-js` (análisis del JS, SiteClient a 2 KB, P4 y P6) por si no se ha mergeado antes.
> **Anterior:** [Fase P](./faseP-codigos.md) · **Siguiente:** fase 11 (producción en Hetzner, ESTADO §6.5)

## 0.1 Decisiones del usuario

|     | Decisión                                                                                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **Ficha:** los relacionados de la hoja y **relleno automático** con su categoría hasta tener 4.                                                                                                                   |
| R2  | **Envío gratis:** aún sin decidir. Cuando se haga, será con las **reglas de precio** de la opción de envío (`item_total ≥ X`, precio 0) y el aviso «te faltan X €» las leerá de ahí (§4). **Fuera de esta fase.** |
| R3  | **Upselling (`mejor_opcion`):** se deja para más adelante.                                                                                                                                                        |
| R4  | **4** relacionados en la ficha y **3** en el carrito.                                                                                                                                                             |
| R5  | **Carrito:** «De tu lista de deseos» primero (hasta 3, con sesión).                                                                                                                                               |
| R6  | Añadir un producto de la lista al carrito **no lo quita de la lista**. Deja de sugerirse mientras esté en el carrito.                                                                                             |
| R7  | Solo en `/carrito/`: ni en el panel lateral ni en el checkout.                                                                                                                                                    |
| R8  | Guardar precio y disponibilidad al guardar un producto en la lista, para avisar de bajadas de precio o reposiciones: **anotado** para cuando se haga (§5).                                                        |

## 1. Qué se ha hecho

### Backend: hoja del catálogo

- **Columna `relacionados`** (`productos.csv`): handles separados por `|`, como mucho 8.
  - Se guarda en `metadata.relacionados` como texto con `|`.
  - El importador valida el formato, que no sea el propio producto, que no haya repetidos, el máximo, y que cada uno exista (en la hoja o en la tienda, con la misma consulta que `sustituto`).
  - `-` borra la lista.
- **Tests** en `catalog-import.unit.spec.ts`.
- **Plantilla:** `productos.csv` y LEEME.
- **`catalog:mock`** rellena `relacionados` en 1 de cada 4 productos (los 2 últimos de **otras** categorías). En la BD local se ha importado: 74 productos con relacionados.

### Storefront: ficha (estática, 0 JS nuevo)

- **`lib/related.ts`** (funciones puras, tests en `related.test.ts`):
  - `productRelated`: los de la hoja primero y, si faltan, otros de la **categoría más concreta**, con stock primero. Sin descatalogados, sin el propio producto y sin correas de relleno.
  - `cartRelatedHandles` y `wishlistAvailable`, para el carrito.
- **`getRelatedByProduct`** (`lib/shop.ts`): calcula los relacionados de todas las fichas **una vez por build**, con el catálogo ya en memoria (sin llamadas extra).
  - Cada bloque entra en el manifiesto de listados.
- **`RelatedProducts.astro`:** «También te puede interesar», con el `ProductCard` de siempre (Añadir, ♡).
  - Carrusel en móvil; en escritorio caben las 4 tarjetas (`.carousel--related`).
  - `LiveSync` con la clave del bloque y `ScrollDrag` (ya cargado en la ficha por la galería).
- **Fichas:** descatalogadas sin bloque. Las correas solo lo tienen si llevan relacionados a mano.
- **Coste medido:**
  - +~45 KB de HTML por ficha (≈ 4 KB comprimidos);
  - una petición más al LiveSync de la ficha (~40 ms en local sin caché, 249 B de respuesta);
  - 0 JS nuevo.

### Storefront: carrito (on-demand)

- **`CartSuggestions.astro`**, dentro de `CartView` (variante página, slot `suggestions`). Así CartLive lo refresca junto con la lista (`/carrito/parcial/`).
  1. **«De tu lista de deseos»** (con sesión):
     - lo guardado que está disponible ahora: la variante guardada con stock, o el producto si se guardó sin variante;
     - sin lo que ya está en el carrito, lo más reciente primero;
     - máximo 3, con el enlace «Ver toda mi lista».
  2. **«Completa tu pedido»:**
     - los relacionados de la hoja de lo que lleva el carrito, ordenados por cuántos productos del carrito los relacionan;
     - con stock, sin correas, sin repetir lo del bloque 1;
     - máximo 3.
- **«Añadir»:** formulario `cart.add` que vuelve a `/carrito/` (PRG, sin JS).
  - Con JS lo envía **CartLive** (`data-cart-add`) y refresca la vista. CartLive pasa de 626 a 639 B gzip.
  - Producto con varias variantes guardado sin variante → «Elegir opciones» (su ficha).
- **Datos:**
  - dos consultas en paralelo al backend (la lista con sus productos, y los relacionados por handle con `getProductsByHandle`);
  - si una falla, se omite su bloque (con log sin datos personales);
  - **coste medido: ~5–10 ms** en `/carrito/` (95 → 103 ms en local).
- **Hallazgo de Medusa 2.21.2:** como con los ajustes de los pedidos (L-3), la Store API **omite `items.product.metadata`** si se pide como campo suelto. Hace falta `*items.product` (`CART_FULL_FIELDS`).

### e2e

- `e2e/relacionados.spec.ts` (10 en total, con escritorio y móvil):
  - ficha: hoja y relleno, carrusel y correa sin bloque;
  - LiveSync;
  - carrito sin JS y con JS (lo añadido deja de sugerirse);
  - con sesión: lista de deseos, orden y R6.
- **Los e2e existentes de la ficha** (carrito, checkout, cuenta, puntos y lista de deseos) acotan «Añadir», «Cantidad», − / + y ♡ al formulario de compra (`#comprar`, `button[name=wish]`): las tarjetas de relacionados tienen los mismos controles, y los títulos de los mock se repiten.
- **Las páginas on-demand llegan por streaming:** tras el 303 del carrito sin JS hay que esperar a `load` antes de leer las sugerencias, que van al final.
- **Total:** 187 e2e pasados (9 omitidos, los de siempre).

## 2. Cómo usarlo

- **En la hoja:** columna `relacionados` (por ejemplo, `collar-cuero | correa-roja`), luego `catalog:import`.
  - Sin relacionados, la ficha completa con 4 de su categoría.
- **El carrito** sugiere los relacionados (de la hoja) de lo que lleva y, con sesión, lo guardado que está disponible.

## 3. Cómo testear

```bash
pnpm --filter backend catalog:mock && pnpm --filter backend catalog:import catalog/mock
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm --filter storefront exec playwright test e2e/relacionados.spec.ts
```

**A mano:**

1. Abre `/producto/mock-abrigo-esencial-017/`: Collar Natural y Transportín Eco (de la hoja) y 2 abrigos más.
2. Añade el Mordedor Premium y ve al carrito: «Completa tu pedido».
3. Con sesión y algo guardado: «De tu lista de deseos».

## 4. Para cuando se haga el envío gratis (R2)

- **Cómo configurarlo:** precio de la opción de envío con regla `item_total gte X` → `amount: 0` (context7 `/medusajs/medusa`, _price rules_).
- **Cómo leerlo:** `GET /store/shipping-options?cart_id=…` con `fields=+prices,+prices.price_rules` devuelve las reglas (comprobado en local).
- **Qué mostrar:** el aviso «te faltan X € para el envío gratis» en el carrito saldría del menor `value` de una regla `item_total` con precio 0. No hay que duplicar el importe en el storefront.

## 5. Pendientes

- **R3 upselling** (`mejor_opcion`): más adelante.
- **R8 alertas de la lista de deseos:** guardar al guardar (`price_at_save`, `in_stock_at_save`; migración del módulo `wishlist`) para marcar «ha bajado de precio» y «vuelve a estar disponible» en el carrito y en `/cuenta/deseos/`. Los **emails** de esos avisos son comerciales: necesitan consentimiento y baja (G4).
- **Relacionados de las correas:** solo a mano. Si se quiere un relleno propio (collares a juego…), habría que definir una regla.
