# Auditoría previa a la fase 10 — rendimiento, bugs y seguridad

> **Estado:** ✅ completada (10-oct-2026)
> **Rama/PR:** `fix/auditoria-pre-fase10` · PR en Gitea (`fix/auditoria-pre-fase10` → `main`)
> **Anterior:** [Fase 9](./fase9.md) · **Siguiente:** Fase 10 (CD + imágenes Docker)

## 1. Objetivos

- [x] Lighthouse móvil de todas las páginas del presupuesto (AGENTS §3.4) con el catálogo real de la BD local (1000 productos).
- [x] Revisión del código sensible (middleware, actions, cookies, redirecciones, caché, Stripe, logs) y pruebas con curl de casos límite.
- [x] `pnpm audit`, fugas de datos en el HTML y accesibilidad con teclado.
- [x] Arreglar lo aprobado y **volver a medir solo lo que cambia**.

## 2. Método

- Build de producción con 1000 productos (`pnpm --filter storefront build`, 1203 páginas) y `pnpm start`.
- Proxy temporal (en `/tmp`, fuera del repo) con **brotli** y `/_astro/*` inmutable, que imita a Caddy (fase 11). Es el método de las fases 4 y 6.
- `pnpm dlx lighthouse@13.5.0 --form-factor=mobile` (simulado: 412 px, DPR 1,75, 4G lento), **mediana de 3 pasadas**.
- Páginas por usuario (carrito, checkout, cuenta) con las cookies reales por `--extra-headers`.

## 3. Resultados de Lighthouse (móvil, mediana)

| Página                                | Perf         | A11y         | SEO        | LCP                            | CLS     | TBT |
| ------------------------------------- | ------------ | ------------ | ---------- | ------------------------------ | ------- | --- |
| Home                                  | 100          | 100          | 100        | 1,90 → **1,52 s**              | 0,001   | 0   |
| `/productos/`                         | 99 → **100** | 100          | 100        | 2,05 → **1,74 s**              | 0,001   | 0   |
| Categoría                             | 98 → **99**  | 100          | 100        | 2,35 → **1,97 s**              | 0,004   | 0   |
| Ficha                                 | 99           | 100          | 100        | 1,82–2,57 s (variable, ver §6) | 0,001   | 0   |
| Ofertas                               | 99           | 100          | 100        | 1,98 → **1,90 s**              | 0,001   | 0   |
| Sobre nosotros / legal                | 100          | 100          | 100 / 69\* | ≤ 1,54 s                       | ≤ 0,002 | 0   |
| `/buscar/`                            | 99           | 100          | 69\*       | 1,91 s                         | 0,001   | 0   |
| `/carrito/`                           | 100          | 100          | 69\*       | 1,53–1,92 s                    | 0,004   | 0   |
| `/checkout/`                          | 99–100       | 97 → **100** | 69\*       | 1,15 s                         | 0,002   | 0   |
| Cuenta (entrar, resumen, direcciones) | 100          | 100          | 69\*       | ≤ 1,87 s                       | ≤ 0,002 | 0   |

\* `noindex` a propósito (páginas por usuario y legales provisionales).

La nota de 91–94 que tenía `/productos/` en la Fase D se midió **sin compresión**; con brotli (lo que hará Caddy) da 99, y 100 con el arreglo de las imágenes.

Peso de las imágenes, antes → después del arreglo §4.2:

| Página        | Imágenes         | Total        | Imagen de más (Lighthouse) |
| ------------- | ---------------- | ------------ | -------------------------- |
| Home          | 297 → **163 KB** | 410 → 277 KB | 216 → 36 KB                |
| `/productos/` | 318 → **165 KB** | 431 → 278 KB | 183 → 6 KB                 |
| Categoría     | 252 → **132 KB** | 366 → 246 KB | 138 → 6 KB                 |
| Ofertas       | 145 → **84 KB**  | 255 → 194 KB | 88 → 20 KB                 |

## 4. Hallazgos y arreglos (commits de la rama)

### 4.1 B1 — Redirecciones por usuario sin `Cache-Control` (alta)

- **Antes:** varias respuestas 303 salían **sin** `Cache-Control`: `/cuenta/` y `/cuenta/datos/` sin sesión, `/cuenta/entrar/` con sesión, `/cuenta/restablecer/`, `/checkout/` sin carrito y parte de `/checkout/completar/`. **Cloudflare cachea por defecto 20 min un 302/303 sin cabecera** (cloudflare-docs: _cache/how-to/configure-cache-status-code_): con una regla «Cache Everything» se serviría la redirección de un usuario a otro.
- **Arreglo:** el middleware pone `private, no-store` en **toda** respuesta de `/carrito/`, `/checkout/`, `/pedido/`, `/cuenta/` y `/_actions/`, incluidas las redirecciones (`lib/cache.ts` `isPrivatePath`, con test). Si las cabeceras son inmutables, copia la respuesta.
- **Re-test:** las 20 combinaciones (ruta × con/sin sesión) llevan `private, no-store`, también los POST de las actions. Las públicas no cambian (`/`, `/productos/`, `/buscar/` con `s-maxage`, sugerencias).

### 4.2 Imágenes de las tarjetas más grandes de lo necesario (rendimiento)

- **Antes:** `sizes` de la rejilla = `50vw` en móvil, cuando la tarjeta ocupa `50vw − 1,5rem` (178 px en 412 px). Además, el carrusel y las categorías de la home usaban el `sizes` de la rejilla aunque sus tarjetas son más estrechas. Resultado: Lighthouse veía de un 66 a un 86 % de cada imagen de sobra.
- **Arreglo** (`lib/images.ts`): `sizes` con el ancho real (rejilla, `CAROUSEL_CARD_SIZES` y `CATEGORY_CARD_SIZES`) y un ancho nuevo de **240 px** en `card`. El carrusel y las categorías reutilizan los mismos ficheros: el `sizes` no cambia el hash. Coste del build: de 25 s a 59 s una sola vez (derivados de 240 px); después vuelve a ir con la caché.
- **Re-test:** ver la tabla de §3. Playwright: Pixel 7 (DPR 2,625) elige 480 px para 178 px CSS (antes 640 px en el carrusel); el escritorio a 1280 px elige 320 px para 264 px CSS.

### 4.3 B3 — Contraste de los pasos pendientes del checkout (accesibilidad)

- **Antes:** `opacity-60` en los pasos 2 y 3 pendientes: títulos a 3,67:1 y textos a 2,47:1 (A11y 97).
- **Arreglo:** borde discontinuo + `text-muted-foreground` (AA), sin `opacity`.
- **Re-test:** A11y del checkout **100** en claro y en oscuro; `color-contrast` ✓.

### 4.4 B4 — Nombre accesible del icono del carrito (accesibilidad)

- **Antes:** `aria-label="Carrito"` con el número del contador visible (WCAG 2.5.3, `label-content-name-mismatch`).
- **Arreglo:** texto oculto «Carrito» + el contador. Nombre accesible: «Carrito» (vacío) o «Carrito 1». Los e2e buscan `/^Carrito( \d+)?$/`.
- **Re-test:** `label-content-name-mismatch` ✓ en home y carrito; árbol de accesibilidad de Playwright: `link "Carrito 1"`.

### 4.5 B5 — Política de cookies

- Añadidas `customer_token` (7 días) y `account_flash` (fase 9) al texto provisional de `/cookies/`.

### 4.6 D1 — `pnpm audit --prod` (dependencias)

- **Antes:** 10 avisos, 4 altos y 6 moderados.
- **Arreglo:** `overrides` en `pnpm-workspace.yaml`, acotados a las versiones vulnerables (context7 `/pnpm/pnpm.io`):
  - `http-cache-semantics@<=4.2.0` → **4.3.0**. Era alto: podía mezclar respuestas cacheadas entre usuarios. Lo usa Astro en la caché de imágenes del build.
  - `ajv@>=8.0.0 <8.18.0` → **8.20.0**. Moderado; misma major.
- **Re-test:** 8 avisos (3 altos y 5 moderados), **todos dentro de `@medusajs/*`** (lodash, braces, uuid, `@graphql-tools/utils`, sprintf-js, postcss-selector-parser, opentelemetry). Se usan en el CLI, en codegen y en el build del Admin; se arreglarán cuando Medusa los suba (Renovate). Build, typecheck y tests en verde con los overrides.

### 4.7 B2 — e2e inestables

- **Causa:** el entorno, no el código. `medusa develop` se reinicia a mitad de suite (su watcher reacciona a un `medusa exec` o a un cambio de rama) y el stock se agota por los pedidos de los e2e de checkout.
- **Arreglo:** `e2e/global-setup.ts` espera 3 respuestas seguidas de `/health` antes de empezar y, si no las hay en 90 s, falla con un mensaje claro. El stock se repone con `pnpm backend:stock:mock` (documentado en `playwright.config.ts`).
- **Re-test:** **3 pasadas seguidas de la suite completa: 97/97** (5 omitidos a propósito: los de Stripe con 3DS y los que solo aplican a un tipo de dispositivo). Con el backend caído: error claro en 90 s.

## 5. Revisado y correcto (sin cambios)

- **Origen y CSRF:** un POST de otro origen o sin `Origin` → 403 (`checkOrigin`); las actions RPC solo aceptan FormData (415).
- **Redirecciones abiertas:** `back` (`//evil`, `https://…`, `/\`), `next` y `javascript:` siempre vuelven a una ruta propia.
- **Entradas:** cantidades fuera de rango, variante inexistente, ids y `cart_id` malformados, `q` de 5000 caracteres, `pagina` negativa o enorme, token manipulado y pedido de otro cliente (404).
- **XSS:** la cookie flash manipulada sale escapada.
- **Fugas:** ni el HTML, ni el JSON del carrito, ni los fragmentos llevan `cart_id` ni el token. `/buscar/` cachea en público sin datos del usuario (el contador sale de la island `private`). Los logs no tienen emails, tokens ni direcciones.
- **Cookies:** `httpOnly` + `SameSite=Lax`, y `Secure` en producción (`COOKIE_SECURE` por defecto `true`); `path` y caducidad correctos.
- **Stripe:** `completar` es idempotente (`cart.complete` con lock + `order_cart`); el webhook se verifica con firma y el secreto es obligatorio en producción.
- **Backend:** `required()` falla en producción si falta un secreto; CORS explícito.
- **Teclado:** foco visible en enlaces, botones, carrusel y cantidad; los popovers se cierran con Escape.

## 6. Pendientes (para las fases siguientes)

- **Fase 10 (CI):**
  - **Lighthouse CI** con el método de §2 (aún no está en el CI, AGENTS §8.2);
  - `pnpm audit --prod --audit-level=high` con una lista de excepciones de las de `@medusajs/*`;
  - los tests de integración del backend.
- **Fase 11 (Caddy/Cloudflare):**
  - brotli/zstd e `/_astro/*` inmutable de verdad;
  - **regla de caché de Cloudflare que respete el origen** (no «Cache Everything» sin respetar `no-store`);
  - rate limiting de entrar/registro/recuperar/checkout.
- **Fase 11/13:**
  - **CSS crítico** inline: el CSS (56 KB, 9 KB con brotli) bloquea unos 110 ms;
  - LCP de la ficha **variable** (1,8–2,6 s entre pasadas sin cambios de código; el desglose apunta a la carga, no a la imagen). La imagen principal pide 800 px para 372 px CSS × DPR 1,75 = 651 px; un ancho de 720 px ahorraría unos 10 KB. Revisarlo con el CSS crítico;
  - `logo-pie.webp` (16 KB, se muestra a 120 px) y `simbolo-header.webp` (7 KB a 26 px) se pueden servir más pequeños.
- **Fase 10/11:** limpieza de carritos (fase9.md §7).
- Quitar los `overrides` cuando `astro` / `@medusajs/*` / `react-email` traigan las versiones arregladas (Renovate lo verá en el Dependency Dashboard).
