# Fase 4 — Carrito

> **Estado:** ✅ completada (04-oct-2026), pendiente de PR/merge por el usuario.
> **Rama/PR:** `feat/fase4-carrito` (desde `main` `3308c70`) · PR pendiente
> **Anterior:** [Fase 6](./fase6.md) · **Siguiente:** Fase 5 (checkout + Stripe)

## 1. Objetivos

- [x] Cookie `cart_id` con `httpOnly`, `SameSite=Lax`, `Secure` configurable (`COOKIE_SECURE`), `path=/` y 30 días.
- [x] Astro Actions (`accept: "form"`, zod) para añadir, actualizar y quitar. **Sin JS** deben funcionar.
- [x] Contador del carrito en la cabecera mediante una server island.
- [x] Mejora progresiva con un único bundle de carrito de ≤ 2 KB gzip:
  - envío con `fetch` sin recargar;
  - contador con animación;
  - toasts globales;
  - flyout lateral en escritorio.
- [x] Botón "Añadir" en la ficha (variante + cantidad).
- [x] Botón "Añadir" en el listado (cantidad) para productos de **una sola variante**.
- [x] Página `/carrito/` on-demand y sin JS: líneas, cantidades, quitar y totales con IVA.
- [x] Playwright **con JS desactivado** (criterio de salida) y con JS activado.

## 2. Plan aprobado (decisiones del usuario)

### 2.1 Estrategia de render

| Pieza                   | Render                                                                                                                                                           | JS                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Ficha, home y listados  | Siguen **estáticos**. Se añaden formularios `<form method="POST">`                                                                                               | 1 bundle de carrito ≤ 2 KB gzip            |
| Contador en la cabecera | Server island `<CartCount server:defer>`. Lee la cookie y responde con `Cache-Control: private, no-store`. El fallback es el enlace/icono del carrito sin número | Script inline de las islas (ya existe)     |
| `/carrito/`             | On-demand (`export const prerender = false`), `noindex` y `private, no-store`                                                                                    | **0 KB** (presupuesto de la página: 15 KB) |
| Flyout de escritorio    | `<dialog>` nativo. Su contenido es HTML generado en el servidor (endpoint o partial on-demand), así el cliente no tiene plantillas                               | Va en el bundle de carrito                 |

### 2.2 Interacción

**Con JS:**

- El formulario se envía con `fetch`, sin recargar la página.
- El servidor devuelve el **nº de artículos**. Con él se actualizan todos los `[data-cart-count]` y se lanza una animación CSS (`bump`).
- Aparece un toast "Añadido: X".
- **Escritorio** (`matchMedia("(min-width: 768px)")`): además se abre el flyout lateral. El flyout lleva un botón "Ver carrito" → `/carrito/`.
- **Móvil**: solo sube el contador y aparece el toast. No hay flyout.
- Pulsar el icono del carrito abre el flyout en escritorio y lleva a `/carrito/` en móvil.
- Los errores (sin stock, carrito inválido…) se muestran como toast con `role="alert"`.

**Sin JS:**

- El formulario hace `POST` a la ruta on-demand de la action y el middleware responde con un **303 a la página de origen** (patrón POST/Redirect/GET).
- Al volver se muestra un aviso con `:target` o con un query param: "Añadido · Ver carrito" o el mensaje de error.
- Detalle de implementación: la ficha es estática y no puede recibir el POST. Por eso los formularios apuntan a una ruta on-demand y se vuelve con `Referer` o con un campo oculto `back`, que hay que validar como **ruta relativa del mismo sitio**.
- No se redirige a `/carrito/` porque obligaría a ir y volver al catálogo en cada compra (decisión del usuario).

### 2.3 Estado en cliente y toasts

- **Quien manda es el servidor.** La cookie es `httpOnly`, así que el cliente nunca la lee. No hay copia del carrito en el cliente ni `localStorage`.
- **Toasts globales con eventos del DOM:**
  - Se lanzan con `dispatchEvent(new CustomEvent("toast", { detail: { msg, kind } }))`.
  - Un único contenedor en el layout: `<div role="status" aria-live="polite">`. Los errores usan `role="alert"`.
  - Animación solo con CSS: entrada con `@starting-style`, salida con clase + `transitionend`, y sin animación si `prefers-reduced-motion`.
  - Se cierran solos a los ~4 s y tienen botón para cerrar.
  - Las islas Svelte futuras (fases 5 y 7) podrán lanzar y escuchar el mismo evento.
- **Sin nanostores ni Svelte para esto.** Medidas tomadas con Vite 8.3.2, esbuild 0.28.2 y Svelte 5.57.1 (gzip):

  | Opción                                                   | Peso                                                                      |
  | -------------------------------------------------------- | ------------------------------------------------------------------------- |
  | Script sin framework (toast + contador + fetch + flyout) | ~0,6 KB                                                                   |
  | Con nanostores (`atom` + 2 suscriptores)                 | +0,4 KB                                                                   |
  | Isla Svelte 5 para toasts                                | ~12,5 KB de runtime + ~0,5 KB de componente + `client.svelte.js` (~10 KB) |
  - Nanostores tendrá sentido cuando haya **varias islas Svelte** compartiendo estado (búsqueda en la fase 7, checkout en la fase 5).

### 2.4 Formularios

- **Ficha (`BuyBox.astro`):**
  - Si hay varias variantes, se elige con radio en la tabla de variantes que ya existe. Si hay una sola, va en `input hidden`.
  - Cantidad: `<input type="number" min="1" max="99">`.
  - Los botones y radios se ocultan o desactivan con `data-if-stock` / `data-if-vstock`. Así los corrige el **modo C** (LiveSync) sin JS nuevo.
- **Listado (`ProductCard.astro`):**
  - Una variante: cantidad + "Añadir".
  - Varias variantes: botón "Elegir opciones" → ficha.
  - Ojo: el enlace de la tarjeta usa `after:absolute after:inset-0`. El formulario debe quedar **por encima** (`relative z-10`).
- El stock que manda es el de Medusa. Si no hay suficiente, Medusa responde `insufficient_inventory` (ver §3) y se convierte en el mensaje "No hay stock suficiente".

### 2.5 Llamada desde el navegador

Medir **las dos opciones** y quedarse con la más ligera:

- **(a)** Cliente `astro:actions` (`actions.cart.add(formData)`). Importa `devalue` y el proxy de actions.
- **(b)** `fetch` directo a `/_actions/cart.add/` con `Accept: application/json`. La respuesta viene en formato devalue: si `data` es un objeto plano simple, se puede leer con un parse mínimo o devolver JSON simple desde un endpoint propio.

### 2.6 Presupuesto de JS (cambios aprobados)

- `check-js-budget.mjs` en home, listados y ficha:
  - se permite **un único bundle de carrito ≤ 2 KB gzip**, identificado por nombre o por ser el único;
  - el resto sigue a 0 bundles.
- Límite de JS inline: subir de 1024 B a **1536 B** **solo si hace falta**. Ahora mismo son 880 B: runtime de islas + LIVE_SYNC_APPLY. La isla `CartCount` añade su propio script de carga.
- Si se sube, razonarlo en este documento y en AGENTS §3.4.
- El bundle se sirve desde `/_astro/` (caché inmutable). Con CSP (fase 11) Astro calcula el hash de sus propios scripts.

### 2.7 Configuración

- `astro.config.mjs`:
  - `session: false`. No se usan sesiones de Astro y así el runtime fs-lite sale del bundle de servidor. El esquema lo admite: `z.literal(false)` en `astro/dist/core/session/config.js`.
  - Nueva variable `COOKIE_SECURE`: `envField.boolean({ context: "server", access: "public", default: true })`.
- `.env.example`: `COOKIE_SECURE=true`, con comentario. En el `.env` local del usuario: `COOKIE_SECURE=false`, para probar por `http://10.0.10.18`.
- CSRF: `security.checkOrigin` por defecto (`true`). Aplica a actions y rutas on-demand, según `astro/dist/actions/handler.js`.

### 2.8 Ficheros previstos

| Nuevo                                         | Qué                                                                                                                                                                         |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/actions/index.ts`                        | `cart.add` (`variant_id`, `quantity`), `cart.update` (`line_id`, `quantity`; 0 = quitar), `cart.remove` (`line_id`), cada una con su esquema zod (`astro/zod`, zod 4.6.5)   |
| `src/middleware.ts`                           | PRG con `getActionContext()`: si `calledFrom === "form"` → ejecuta, pone el resultado en query y redirige 303 a la página de origen                                         |
| `src/lib/cart.ts`                             | Cookie (`getCartId`/`setCartId`/`clearCartId`), `getOrCreateCart`, `retrieveCart` y traducción de errores. Usa el `sdk()` de `medusa.ts` (exportarlo o mover ahí la lógica) |
| `src/lib/cart.test.ts`                        | Opciones de la cookie, esquemas, mapeo de errores y validación de `back`                                                                                                    |
| `src/pages/carrito/index.astro`               | Página on-demand                                                                                                                                                            |
| `src/pages/carrito/flyout.astro` (o endpoint) | HTML del flyout para el cliente                                                                                                                                             |
| `src/components/server/CartCount.astro`       | Server island del contador                                                                                                                                                  |
| `src/components/AddToCart.astro`              | Formulario reutilizable para ficha y tarjeta                                                                                                                                |
| `src/components/Toasts.astro` + `<script>`    | Contenedor + bundle de carrito (toasts, contador, fetch, flyout)                                                                                                            |
| `e2e/carrito.spec.ts`, `playwright.config.ts` | e2e con JS on y off                                                                                                                                                         |

| Modificado                          | Qué                                                                     |
| ----------------------------------- | ----------------------------------------------------------------------- |
| `BuyBox.astro`, `ProductCard.astro` | Formularios                                                             |
| `BaseLayout.astro`                  | Icono del carrito + `CartCount` + contenedor de toasts + `<dialog>`     |
| `global.css`                        | Keyframes `bump`, toasts, flyout                                        |
| `astro.config.mjs`, `.env.example`  | `session: false`, `COOKIE_SECURE`                                       |
| `scripts/check-js-budget.mjs`       | Regla nueva (§2.6)                                                      |
| `package.json` (storefront)         | `@playwright/test@1.63.0` (dev) + script `test:e2e`                     |
| Docs                                | README §4 (Playwright), §8, §13; AGENTS §3.4; `ESTADO.md`; este fichero |

**Backend:** sin cambios. La Store API de carrito es suficiente.

### 2.9 Tests

- **Vitest:** funciones puras de `lib/cart.ts`.
- **Playwright** (`pnpm --filter storefront test:e2e`):
  - **Solo en local** por ahora. Necesita infra + Medusa + un build/preview.
  - Entra en el CI en la fase 10, de cara al deploy (decisión del usuario).
  - Usa Chromium 1243, que ya está en `~/.cache/ms-playwright` (es la revisión de Playwright 1.63.0, publicado el 04-sep-2026). No hace falta descargar navegadores.
  - Casos con `javaScriptEnabled: false`:
    - añadir desde la ficha;
    - añadir desde el listado;
    - ver `/carrito/`;
    - cambiar la cantidad;
    - quitar hasta dejarlo vacío;
    - error de stock.
  - Casos con JS:
    - el contador sube sin recargar;
    - aparece el toast;
    - el flyout se abre en escritorio y no en móvil.
- `check:budget` y Lighthouse en `/carrito/` y en la ficha (sin regresión respecto a la fase 6).

## 3. Datos verificados (Store API, Medusa 2.21.2, local)

- `POST /store/carts {region_id}` crea el carrito. El canal de venta lo pone la publishable key.
- `POST /store/carts/:id/line-items {variant_id, quantity}` con más cantidad que stock devuelve:
  `{"code":"insufficient_inventory","type":"not_allowed","message":"Some variant does not have the required inventory"}`.
- Carrito inexistente: `{"type":"not_found","message":"Cart with id '…' not found"}`. Hay que borrar la cookie y crear otro.
- Carrito completado: `INVALID_DATA "Cart … is already completed."` (`validate-cart.js`). Mismo tratamiento.
- `fields` mínimos útiles: `id,completed_at,currency_code,item_total,item_subtotal,item_tax_total,items.id,items.quantity,items.product_title,items.variant_title,items.product_handle,items.thumbnail,items.unit_price,items.total,items.variant_id`.
  - Importes en unidad principal y con IVA incluido. Ejemplo: `unit_price 44.95`, `item_total 89.9`, `item_tax_total 8.17`.
- La miniatura (`items.thumbnail`) es la URL del bucket. En `/carrito/` se usa `<Image>` en runtime, o directamente la URL con `width`/`height` si el endpoint `/_image` no conviene. Hay que decidirlo midiendo.
- Variante útil para probar errores: `mock-aceite-de-oliva-ligero-023`, cuya primera variante tiene stock 0.

## 4. Fuentes consultadas

| Tema                                                                                                  | Fuente                                                                                                |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Actions con form, `accept: "form"`, `getActionResult`, `getActionContext`, PRG, `ACTION_QUERY_PARAMS` | astro-docs: guides/actions, reference/modules/astro-actions                                           |
| Cookies (`AstroCookieSetOptions`), `security.checkOrigin`, `session`                                  | astro-docs: api-reference#cookies, configuration-reference#security, integrations-guide/node#sessions |
| Server islands (cookies, caché GET, Referer)                                                          | astro-docs: guides/server-islands                                                                     |
| Scripts procesados (bundle/inline < 4 KB)                                                             | astro-docs: guides/client-side-scripts. Código: `core/build/plugins/plugin-scripts.js`                |
| Carrito Medusa (`sdk.store.cart.*`, totales, inventario)                                              | context7 `/medusajs/medusa` (storefront-development/cart/*) + llamadas reales a la Store API          |
| Compartir estado entre islas                                                                          | astro-docs: recipes/sharing-state-islands                                                             |

## 5. Implementación (qué se hizo y cómo difiere del plan)

### 5.1 Ficheros

| Fichero (`apps/storefront/…`)                                                              | Qué                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/cart.ts` (+ `cart.test.ts`)                                                       | Funciones **puras**: opciones de la cookie, `actionUrl`, `safeBackPath` (anti open redirect), `redirectTarget`, `classifyCartError`, `itemCount`, avisos y mensajes |
| `src/lib/medusa.ts`                                                                        | `createCart`, `retrieveCart`, `addLineItem`, `updateLineItem`, `deleteLineItem` y los `fields` mínimos (`CART_COUNT_FIELDS`, `CART_FULL_FIELDS`)                    |
| `src/lib/cart-server.ts`                                                                   | `currentCart(cookies)`: carrito completo a partir de la cookie (página y flyout)                                                                                    |
| `src/actions/index.ts`                                                                     | `cart.add`, `cart.update` (0 = quitar), `cart.remove`, con `accept: "form"` y zod. Los fallos de negocio devuelven un `CartResult` con código, no lanzan            |
| `src/middleware.ts`                                                                        | PRG: con `Accept: application/json` → JSON `{code,count,msg}`; si no → **303** a `back` + `#carrito-<código>`                                                       |
| `src/pages/carrito/index.astro`                                                            | On-demand, `noindex`, `private, no-store`, **0 JS**. Recibe los POST (`/carrito/?_action=cart.*`)                                                                   |
| `src/pages/carrito/flyout.astro`                                                           | **Partial** on-demand (`export const partial = true`) con el HTML del flyout                                                                                        |
| `src/components/CartView.astro`                                                            | Contenido del carrito, compartido por la página (editable) y el flyout (solo lectura)                                                                               |
| `src/components/server/CartCount.astro` + `CartCountBadge.astro`                           | Server island del contador (`private, no-store`); el fallback es el mismo badge oculto                                                                              |
| `src/components/AddToCart.astro`                                                           | Formulario reutilizable (ficha y tarjeta); los botones usan `data-if-stock` (LiveSync)                                                                              |
| `src/components/CartNotice.astro`                                                          | Avisos sin JS: un `<p id="carrito-<código>">` por código, visibles con `:target`                                                                                    |
| `src/components/CartClient.astro`                                                          | **Único bundle de carrito**: toasts por evento DOM `toast`, contador con `bump`, `fetch` de los formularios y flyout `<dialog>` en escritorio                       |
| `BuyBox.astro`, `ProductCard.astro`, `ProductGrid.astro`, `BaseLayout.astro`, `global.css` | Formularios, radios de variante, icono + contador en la cabecera, avisos, toasts, flyout                                                                            |
| `astro.config.mjs`, `.env.example`                                                         | `session: false`, `COOKIE_SECURE`, `assetsInlineLimit` para que `CartClient` vaya como fichero                                                                      |
| `scripts/check-js-budget.mjs`                                                              | Regla nueva (§2.6)                                                                                                                                                  |
| `playwright.config.ts`, `e2e/carrito.spec.ts`                                              | e2e (escritorio + móvil, con y sin JS)                                                                                                                              |

### 5.2 Decisiones tomadas

| Decisión                                                                                                                  | Motivo                                                                                                                                                                                                                                                                   | Fuente                                                                         |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Los formularios hacen POST a `/carrito/?_action=cart.<x>` (ruta on-demand) con campo `back`                               | Las páginas prerenderizadas no ejecutan actions (`handleAction` sale si `isPrerendered`). `back` se valida: debe empezar por `/`, no por `//` ni `/\`, sin caracteres de control y ≤ 512                                                                                 | astro-docs `guides/actions`; código `astro/dist/actions/handler.js`            |
| El aviso sin JS viaja en el **fragmento** (`#carrito-added`) y se muestra con `:target`                                   | Las páginas son estáticas: no pueden leer un query param en el servidor. El fragmento no rompe la caché ni necesita JS                                                                                                                                                   | MDN `:target`                                                                  |
| **Opción (b)** de §2.5: `fetch` + JSON simple desde el middleware                                                         | Medido: (a) cliente `astro:actions` = **4282 B gzip**; (b) = **992 B gzip**                                                                                                                                                                                              | medición con `pnpm build`                                                      |
| `CartClient` como **fichero** en `/_astro/` (no inline)                                                                   | Astro inlinea scripts < 4 KB. Inline sumaría sus ~1 KB al JS inline de cada página (979 + 992 B > 1 KB). Como fichero, se cachea de forma inmutable y se descarga una vez para todo el sitio; el JS inline se queda en **979 B**. No hace falta subir el límite a 1,5 KB | código `astro/dist/core/build/plugins/plugin-scripts.js` (`shouldInlineAsset`) |
| Errores de la Store API por **mensaje + status** (el SDK no expone el `code`)                                             | `FetchError(message, statusText, status)`. Mensajes reales verificados (§3 y §5.3)                                                                                                                                                                                       | código `@medusajs/js-sdk/dist/esm/client.js` + llamadas reales                 |
| Carrito caducado → se crea otro y se reintenta **una vez** (`add`); en `update`/`remove` → aviso "Tu carrito ha caducado" | No se pierde la compra que estaba haciendo el usuario                                                                                                                                                                                                                    | —                                                                              |
| `remove` confirma con un GET si el DELETE falla                                                                           | `DELETE /store/carts/<inexistente>/line-items/:id` devuelve **500 `unknown_error`**, sin pista de que el carrito no existe                                                                                                                                               | llamada real a Medusa 2.21.2                                                   |
| Toast siempre; flyout **además** en escritorio                                                                            | §2.2 del plan                                                                                                                                                                                                                                                            | —                                                                              |
| Flyout como partial (`export const partial = true`) insertado con `innerHTML`                                             | HTML de nuestro servidor, sin scripts ni estilos (compatible con CSP). El cliente no lleva plantillas                                                                                                                                                                    | astro-docs `basics/astro-pages#page-partials`                                  |
| Miniaturas del carrito con `<Image>` en runtime (`/_image`, WebP 80/56 px)                                                | Funciona en el servidor Node con `remotePatterns`: 200 `image/webp` de ~3 KB                                                                                                                                                                                             | astro-docs `guides/images`                                                     |
| `/carrito/` sin server island ni bundle (`cartCount`, `cartClient={false}` en `BaseLayout`)                               | La página ya es on-demand: el contador se pinta en el HTML. Resultado: **0 JS**                                                                                                                                                                                          | —                                                                              |
| Cabecera: en móvil, logo + carrito en la 1.ª fila y menú a todo el ancho en la 2.ª; en escritorio, logo · menú · carrito  | La altura no depende de la fuente (lección de la fase 6). CLS medido = 0                                                                                                                                                                                                 | —                                                                              |
| Listado: el formulario de la tarjeta lleva `relative z-10` sobre el enlace estirado (`after:inset-0`)                     | Verificado con `elementFromPoint`: el clic cae en el botón "Añadir"                                                                                                                                                                                                      | —                                                                              |
| Playwright en serie (`workers: 1`) y proyectos `escritorio` (Desktop Chrome) y `movil` (Pixel 7)                          | Los tests comparten backend (stock). El flyout solo existe en escritorio                                                                                                                                                                                                 | context7 `/microsoft/playwright`                                               |

### 5.3 Medidas

- **JS** (1000 productos, `check:budget`): 1089 páginas OK. Bundle `CartClient` **992 B gzip**. JS inline de la ficha **979 B gzip** (runtime de 2 islas + LiveSync). `/carrito/`: 0 JS.
- **Build**: 1000 productos con la caché de imágenes en ~20 s. Con fixtures (CI): OK.
- **Lighthouse móvil** (simulado, `lighthouse@13.5.0`, proxy temporal con brotli como en la fase 6; mediana de 3–5 pasadas):

  | Página                                  | Perf | A11y | SEO     | LCP    | CLS | TBT |
  | --------------------------------------- | ---- | ---- | ------- | ------ | --- | --- |
  | Home                                    | 100  | 100  | 100     | 1,60 s | 0   | 0   |
  | Listado `/productos/`                   | 100  | 100  | 100     | 1,59 s | 0   | 0   |
  | Ficha `mock-bufanda-natural-020`        | 100  | 100  | 100     | 1,82 s | 0   | 0   |
  | Ficha `mock-aceite-de-oliva-ligero-023` | 100  | 100  | 100     | 1,66 s | 0   | 0   |
  | `/carrito/`                             | 100  | 100  | 66 (\*) | 1,21 s | 0   | 0   |

  (\*) `noindex` a propósito. Comparación con `main` en la misma máquina y ficha: bufanda 1,51–2,35 s y aceite 1,36–1,66 s. Hay mucho ruido entre pasadas; no se ve una regresión clara (el bundle de carrito se pide en paralelo, con prioridad alta, y no bloquea). La diferencia con los 1,21 s de la fase 6 viene de la ficha medida y del ruido. Se revisará con Caddy real (fase 11).

- **Store API (Medusa 2.21.2)**, errores reales además de los de §3:
  - `POST /store/carts/<inexistente>/line-items[/:id]` → 404 `"Cart id not found: <id>"` (mensaje distinto al del GET).
  - `DELETE /store/carts/<inexistente>/line-items/:id` → 500 `unknown_error`.
  - Variante inexistente → 400 `invalid_data`. Se trata como error genérico.

## 6. Cómo testear esta fase

```bash
pnpm infra:up && pnpm dev:backend            # otra terminal
# apps/storefront/.env: COOKIE_SECURE=false (http local)
pnpm --filter storefront build               # o STOREFRONT_MAX_PRODUCTS=100 para ir rápido
pnpm --filter storefront check:budget        # OK, "único bundle permitido: CartClient… ~992 B gzip"
pnpm --filter storefront test                # Vitest: 26 tests (incluye lib/cart)
pnpm --filter storefront test:e2e            # Playwright: 14 tests (7 escritorio + 7 móvil), arranca `pnpm start` si no está
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build
```

A mano (`pnpm --filter storefront start` → http://localhost:4321 o http://10.0.10.18:4321):

1. **Sin JS** (DevTools → desactivar JavaScript): en una ficha, "Añadir" vuelve a la ficha con el aviso "Añadido al carrito · Ver carrito". En `/carrito/`, cambiar la cantidad + "Actualizar", "Quitar", y cantidad 0 quita la línea. Pedir 99 unidades → "No hay stock suficiente".
2. **Con JS, escritorio**: "Añadir" no recarga, el contador sube con animación, sale el toast y se abre el flyout lateral (Esc o clic fuera lo cierran). El icono del carrito abre el flyout.
3. **Con JS, móvil**: contador + toast, sin flyout. El icono lleva a `/carrito/`.
4. Listado: los productos de 1 variante tienen cantidad + "Añadir"; los de varias, "Elegir opciones".

Con curl (sin JS, comprobaciones de seguridad):

```bash
B=http://localhost:4321
curl -s -D - -o /dev/null -H "Origin: $B" -d "back=//evil.example/&variant_id=<id>&quantity=1" "$B/carrito/?_action=cart.add" | grep -i location   # → /#carrito-added
curl -s -H "Origin: https://evil.example" -d "variant_id=<id>&quantity=1" "$B/carrito/?_action=cart.add"   # → 403 (checkOrigin)
```

## 7. Criterio de salida

- [x] Playwright con JS desactivado: añadir (ficha y listado), actualizar y quitar. También el error de stock.
- [x] Con JS: sin recargar; contador, toast y flyout (solo escritorio).
- [x] `check:budget` OK con la regla nueva; JS del carrito ≤ 2 KB gzip (992 B).
- [x] Lighthouse móvil ≥ 95 en ficha y `/carrito/` (100 en ambas).
- [x] lint, format:check, typecheck, test y build en verde.

## 8. Pendientes / riesgos

- **"Ir a pagar"** está desactivado hasta la fase 5 (checkout + Stripe).
- **Aviso `[csp]` en el build**: desde esta fase sale `context.csp was used … but CSP was not configured` en cada página con `LiveSync` (`Astro.csp?.insertScriptHash`). Es solo un aviso (el build y el resultado son correctos). Aparece al añadir cualquier variable nueva al esquema `env` (se reprodujo con una variable de prueba de tipo string). Desaparecerá al activar `security.csp` en la fase 11.
- **Gastos de envío**: el carrito muestra el total de artículos; el envío se elige en el checkout (fase 5).
- **Playwright fuera del CI** hasta la fase 10 (necesita infra + Medusa). Los tests usan el catálogo mock local (`mock-bufanda-natural-020`, `mock-aceite-de-oliva-ligero-063`).
- **Stock en el formulario**: el `max` del input es 99; el stock real lo valida Medusa (`insufficient_inventory`).
- Rate limiting de las actions del carrito: en Caddy/Cloudflare (fase 11).
