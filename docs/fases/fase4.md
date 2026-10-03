# Fase 4 — Carrito

> **Estado:** ⏳ plan aprobado. Falta implementar: no hay código escrito todavía.
> **Rama/PR:** `feat/fase4-carrito`, creada desde `main` (`d007112`) · PR pendiente
> **Anterior:** [Fase 6](./fase6.md) · **Siguiente:** Fase 5 (checkout + Stripe)

## 1. Objetivos

- [ ] Cookie `cart_id` con `httpOnly`, `SameSite=Lax`, `Secure` configurable (`COOKIE_SECURE`), `path=/` y 30 días.
- [ ] Astro Actions (`accept: "form"`, zod) para añadir, actualizar y quitar. **Sin JS** deben funcionar.
- [ ] Contador del carrito en la cabecera mediante una server island.
- [ ] Mejora progresiva con un único bundle de carrito de ≤ 2 KB gzip:
  - envío con `fetch` sin recargar;
  - contador con animación;
  - toasts globales;
  - flyout lateral en escritorio.
- [ ] Botón "Añadir" en la ficha (variante + cantidad).
- [ ] Botón "Añadir" en el listado (cantidad) para productos de **una sola variante**.
- [ ] Página `/carrito/` on-demand y sin JS: líneas, cantidades, quitar y totales con IVA.
- [ ] Playwright **con JS desactivado** (criterio de salida) y con JS activado.

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

## 5. Cómo testear esta fase

_(Se rellena al implementar.)_

## 6. Criterio de salida

- [ ] Playwright con JS desactivado: añadir (ficha y listado), actualizar y quitar.
- [ ] Con JS: sin recargar; contador, toast y flyout (solo escritorio).
- [ ] `check:budget` OK con la regla nueva; JS del carrito ≤ 2 KB gzip.
- [ ] Lighthouse móvil ≥ 95 en ficha y `/carrito/`.
- [ ] lint, format:check, typecheck, test y build en verde.

## 7. Pendientes / riesgos

- La ficha estática no puede recibir el POST de la action. La ruta destino y la validación de `back` (open redirect) necesitan cuidado.
- La isla `CartCount` puede hacer que el JS inline pase de 1 KB (por eso el límite pasaría a 1,5 KB).
- El HTML del flyout lo genera el servidor: hay que medir la latencia y cuánto ocupa.
- "Ir a pagar" queda como provisional hasta la fase 5.
