# Auditoría de rendimiento (23-oct-2026)

> **Estado:** ✅ medida hecha; propuestas pendientes de decisión (no se ha cambiado código)
> **Rama/PR:** `perf/auditoria-rendimiento` (solo este documento)
> **Anterior:** [Fase F](./faseF-filtros.md) · Referencia: [auditoría previa a la fase 10](./auditoria-pre-fase10.md), [análisis del JS](../analisis-js.md)

Origen: después de la Fase F, `/buscar/` dio 98 en una medida suelta. Se pidió una auditoría completa en móvil y escritorio, con 1000 productos, capacidad incluida.

## 1. Resumen

- **No hay regresión de la Fase F.** El 98 era ruido de una sola pasada: con 5 pasadas `/buscar/` da **99 en móvil** (99–99 en las tres variantes) y **100 en escritorio**. CLS ≤ 0,002.
- **Escritorio: 100 en todo**, salvo un CLS de 0,05 en `/sobre-nosotros/` (§4.4).
- **Móvil: 99–100 en todo**, salvo **tres fichas con 95–96**. La causa es el LCP de 2,8 s, que sale de **cómo se descargan las fotos de la galería**, no de la página (§4.1). Es el hallazgo principal y el más barato de arreglar.
- **Capacidad**: con Medusa limitado a 2 núcleos (como el VPS), **satura a ~25 páginas/s**. El 80 % del tiempo de Medusa es la island de precio y stock (`LiveSyncData`). Una **caché de 30 s** en esa island lo sube a **60 páginas/s** con 0 errores (§5).
- **Navegación**: las Speculation Rules (prefetch, sin JS) recortan ~500 ms al pasar de un listado a una ficha en móvil (§4.6).

## 2. Método

- **Datos**: 1068 productos publicados (1000 mock con 4 fotos cada uno, más los reales y los de prueba), 2416 variantes mock, índice de Meilisearch al día. `catalog:mock 1000` → `catalog:import catalog/mock` → `images:mock` → `images:import` → `stock:mock`.
- **Backend**: `medusa build` y `medusa start` (código compilado, sin watcher). Diferencias con producción: `NODE_ENV=development` (para usar Mailpit), Admin desactivado y Postgres/Redis/Meilisearch en Docker local.
- **Storefront**: `pnpm build` contra ese backend (1262 páginas; 26 min con 2800 fotos nuevas, después a la caché) y el servidor de `@astrojs/node`.
- **Delante**, el proxy de `scripts/lhci-server.mjs` (brotli y `/_astro/*` inmutable, como Caddy).
- **Lighthouse 12.6.1** (el de `@lhci/cli` 0.15.1), presets **móvil** (412 px, DPR 1,75, 4G lento, CPU 4×) y **escritorio**, **mediana de 5 pasadas**, 20 URL, con la máquina sin otras cargas. Las páginas con sesión llevan las cookies de una cuenta de prueba con 3 productos en el carrito y 1 en la lista de deseos.
- **Herramientas de esta auditoría**: en `/tmp/perf/`, fuera del repo. Son un ejecutor de Lighthouse, proxies de prueba A/B (Speculation Rules, CSS inline, caché de la island) y scripts de Playwright con CDP.
- **Capacidad**: k6 `grafana/k6:2.3.0` con `loadtest/k6/tienda.js` (el recorrido de la fase 11), Medusa fijado a **2 núcleos** (`taskset`, como el CPX22) y Astro a otros 2.

## 3. Laboratorio (Lighthouse, mediana de 5)

### 3.1 Móvil

| Página                            | Perf (rango) | A11y | BP  | SEO  | FCP  | LCP (rango)      | TBT | CLS   |
| --------------------------------- | ------------ | ---- | --- | ---- | ---- | ---------------- | --- | ----- |
| Home                              | 99 (99–100)  | 100  | 100 | 100  | 1,21 | 2,03 (1,58–2,03) | 0   | 0     |
| `/productos/`                     | 99           | 100  | 100 | 100  | 1,21 | 1,81             | 0   | 0,001 |
| Categoría padre (Perro)           | 99           | 100  | 100 | 100  | 1,21 | 1,81             | 0   | 0,001 |
| Categoría hoja (Piensos)          | 99           | 100  | 100 | 100  | 1,21 | 1,96             | 0   | 0,002 |
| `/ofertas/`                       | 99 (99–100)  | 100  | 100 | 100  | 1,21 | 2,03 (1,66–2,11) | 0   | 0     |
| Ficha, 1 variante (clicker)       | 99 (99–100)  | 100  | 100 | 100  | 1,05 | 1,96             | 0   | 0     |
| **Ficha con tabla (champú)**      | **96**       | 100  | 100 | 100  | 1,21 | **2,78**         | 0   | 0     |
| **Ficha con analíticos (pienso)** | **95**       | 100  | 100 | 100  | 1,21 | **2,86**         | 0   | 0     |
| **Ficha a granel (premios)**      | **95**       | 100  | 100 | 100  | 1,21 | **2,86**         | 0   | 0     |
| Ficha con selector (arnés)        | 99           | 100  | 100 | 100  | 1,21 | 1,81             | 0   | 0     |
| Correa: landing                   | 100          | 100  | 100 | 100  | 1,21 | 1,51             | 0   | 0     |
| Correa: configurador              | 100          | 100  | 100 | 100  | 1,06 | 1,66             | 0   | 0,001 |
| `/buscar/`                        | 99           | 100  | 100 | 69\* | 1,21 | 1,81 (1,66–2,18) | 0   | 0,001 |
| `/buscar/?q=pienso`               | 99           | 100  | 100 | 69\* | 1,21 | 1,96             | 0   | 0,001 |
| `/buscar/` con 3 filtros          | 99 (99–100)  | 100  | 100 | 69\* | 1,21 | 1,96 (1,51–2,19) | 0   | 0,001 |
| Sobre nosotros                    | 100          | 100  | 100 | 100  | 1,06 | 1,51             | 0   | 0,003 |
| `/carrito/` (3 productos)         | 100          | 100  | 100 | 69\* | 0,92 | 1,21             | 0   | 0,001 |
| `/checkout/`                      | 100          | 100  | 100 | 69\* | 0,91 | 1,13             | 0   | 0,001 |
| `/cuenta/`                        | 100          | 100  | 100 | 69\* | 1,21 | 1,43             | 0   | 0,002 |
| `/cuenta/deseos/`                 | 100          | 100  | 100 | 69\* | 1,21 | 1,43             | 0   | 0,001 |

Tiempos en segundos. \* `noindex` a propósito.

### 3.2 Escritorio

Todas las páginas: **Perf 100, A11y 100, BP 100**. FCP 0,26–0,33 s, LCP 0,33–0,57 s, TBT 0. Fichas con tabla, analíticos o granel: LCP 0,54–0,57 s (el resto ≤ 0,45 s). Única excepción: **`/sobre-nosotros/` con CLS 0,05–0,09** (Perf 98–100; §4.4).

### 3.3 Comparación con la auditoría previa a la fase 10 (móvil)

| Página        | Pre-fase 10 | Ahora  |
| ------------- | ----------- | ------ |
| Home          | 100         | 99–100 |
| `/productos/` | 100         | 99     |
| Categoría     | 99          | 99     |
| Ficha         | 99          | 95–99  |
| `/buscar/`    | 99          | 99     |
| Carrito       | 100         | 100    |
| Checkout      | 99–100      | 100    |

Estable, salvo las fichas con fotos grandes (§4.1). El FCP de 1,05–1,21 s se repite en todas las páginas: es el coste fijo de la cabecera, el CSS y la fuente (§4.3).

## 4. Hallazgos

### 4.1 🔴 La galería de la ficha descarga las 4 fotos grandes al cargar (LCP 2,8 s en móvil)

- **Medida**:
  - Lighthouse desglosa el LCP de la ficha del champú en **Render Delay 1377 ms** y Load Delay 864 ms, con la foto LCP pedida a los 50 ms.
  - En Playwright, en un Pixel 7, la ficha pide **las 4 fotos a tamaño de galería** (foto 1 a los 34 ms; 2, 3 y 4 a los 86 ms), aunque solo se ve la primera. Son **415 KB de imágenes** (110 KB solo la foto 4).
- **Causa**:
  - Las fotos 2–4 llevan `loading="lazy"`, pero están en un carrusel horizontal dentro del viewport en vertical.
  - Chromium descarga las imágenes `lazy` que están «cerca» del viewport, y en horizontal las tres están a menos de una pantalla.
  - Las cuatro compiten por el ancho de banda (4G lento) con la LCP, y la LCP tarda más en pintarse.
- **Por qué varía entre fichas**: depende del peso de las fotos. El clicker (13 KB) da 1,96 s y el pienso (59 KB por foto) 2,86 s. El arnés de prueba, con fotos de 1–2 KB, da 1,81 s. Con fotos reales de 2400 px, el problema será **igual o peor**.
- **Propuesta P1** (barata, sin JS):
  - Las fotos 2–4 de la galería con **`fetchpriority="low"`**, y la LCP con `fetchpriority="high"` como ahora.
  - Si no basta, `content-visibility: auto` en los `<li>` que no son el primero, o no pintar la foto grande hasta que su miniatura se pulsa. Esto último no es posible sin JS: se quedaría con `lazy`.
  - Medir con el mismo método y, si hace falta, el siguiente paso.
- **Propuesta P2**: el ancho de la imagen principal en móvil. Con DPR 1,75 pide 800 px para 376 px CSS (658 px reales). Un ancho de **720 px** en `IMAGE_PRESETS.detail.widths` ahorra un ~15 % por foto. Es lo que ya proponía la auditoría previa a la fase 10, §6.

### 4.2 🟠 Logos sobredimensionados

- **Medida**:
  - `logo-pie.webp`: **240×224 px, 16,6 KB** para 120×112 CSS. Lighthouse estima 14 KB de más.
  - `simbolo-header.webp`: 108×131 px, 6,8 KB para 36×44 CSS. Estima 6,6 KB de más; es la 3× hecha a propósito en I-Marca.
- **Propuesta P3**:
  - El logo del pie con `srcset` 1×/2× (120 y 240 px). Re-codificado a 240 px y calidad 82 se queda en 15,4 KB, así que el ahorro real está en servir 120 px a DPR 1 y en el `lazy` que ya lleva.
  - El símbolo de la cabecera con `srcset` 2×/3× (72/108 px; 80 px pesa 3,2 KB).
  - Ganancia pequeña (5–15 KB por primera visita), pero se repite en todas las páginas.

### 4.3 🟠 CSS bloqueante: inline mejora el LCP de la home y los listados, pero pesa más

- **Medida**:
  - El CSS global ocupa 63–71 KB sin comprimir (12 KB con gzip) y se usa entre el 63 % y el 71 % por página (coverage de Chromium).
  - Lighthouse lo marca como bloqueante: ~300 ms estimados.
  - **Prueba A/B** con un proxy que mete el CSS en el HTML, 7 pasadas en móvil:

| Página          | `<link>` (hoy)  | CSS inline (cota superior)        |
| --------------- | --------------- | --------------------------------- |
| Home            | 99 · LCP 1,81 s | **100 · LCP 1,36 s**              |
| Categoría Perro | 99 · LCP 1,81 s | **100 · LCP 1,28 s**              |
| Ficha champú    | 97 · LCP 2,64 s | 99 · LCP 1,96 s (rango 1,73–2,71) |

- **Coste**:
  - Cada HTML crece ~12 KB gzip (la home pasa de 18,8 a 30,7 KB) y el CSS deja de cachearse entre páginas.
  - Con la CSP por hashes, el `<style>` necesitaría su hash: Astro lo hace solo con `build.inlineStylesheets: "always"`, pero hay que comprobarlo con `security.csp`.
  - Cloudflare cachea el HTML, así que el peso extra se paga en ancho de banda, no en TTFB.
- **Propuesta P4** (investigar antes de decidir):
  - **a)** `inlineStylesheets: "always"`: es la cota medida. Se gana en primera visita y se pierde en las siguientes.
  - **b)** CSS crítico real: solo la cabecera y el «above the fold», el resto con `<link>`. Más trabajo y hace falta una herramienta nueva.
  - **c)** Dejarlo y quitar CSS sin uso: un 30 % sin usar por página. Probablemente lo menos rentable.
  - **Recomendación**: medir la a) con 2–3 páginas encadenadas (primera visita y siguientes) antes de decidir.

### 4.4 🟡 CLS de 0,05 en `/sobre-nosotros/` (escritorio)

- **Medida**: la desplazada es una `<li>` de la lista del Markdown. La causa que da Lighthouse son los iconos de pago del pie (`/pagos/visa.svg` y otros, «media element lacking an explicit size»). En Playwright, con 4G simulado, el desplazamiento es mínimo (0,001–0,002). Lo provoca el cambio de fuente (Nunito Sans) en el texto largo, y solo se ve con el preset de escritorio de Lighthouse.
- **Propuesta P5** (barata):
  - Revisar el `width`/`height` de los iconos de pago. Ya los llevan (48×30), así que puede ser el `<li>` contenedor sin altura fija.
  - Probar `size-adjust`/`ascent-override` en la fuente de reserva. La Fonts API de Astro tiene `fallbacks` con métricas: comprobar en astro-docs que está activo.

### 4.5 🟡 Peticiones de islands por página

- **Medida** (mediana, sin carga): `HeaderState` tarda 1–2 ms sin sesión y 13 ms con ella. `LiveSyncData`:

| Página           | Tiempo | Tamaño (gzip) |
| ---------------- | ------ | ------------- |
| Ficha            | 30 ms  | 190–375 B     |
| Home             | 47 ms  | 390 B         |
| Ofertas          | 61 ms  | 680 B         |
| Listados         | 84 ms  | 590 B         |
| Correa (landing) | 155 ms | 390 B         |

- **La ficha hace dos `LiveSyncData`**: la suya y la de los relacionados. Son dos idas a Medusa por vista.
- **Propuesta P6**: un solo `LiveSyncData` por ficha con los ids de la ficha y de los relacionados. -1 petición por vista; ayuda a la capacidad (§5). Riesgo bajo: el aplicador ya empareja por id.

### 4.6 🟢 Speculation Rules: ~500 ms menos de listado a ficha en móvil

- **Prueba A/B**:
  - Proxy que inyecta `<script type="speculationrules">` con `prefetch` y `eagerness: "moderate"` para `/producto/*`, `/categoria/*` y `/productos/*`.
  - Pixel 7, 4G lento, CPU 4×, toque en una tarjeta de `/categoria/perro/`, 6 navegaciones.

|            | Toque → `<h1>` | FCP de la ficha | Tipo de entrega            |
| ---------- | -------------- | --------------- | -------------------------- |
| Sin reglas | 2680 ms        | 496 ms          | red                        |
| Con reglas | **2187 ms**    | **328 ms**      | `navigational-prefetch` ×6 |

- **Coste**:
  - 0 KB de JS: es JSON en el `<head>`. Necesita su hash en la CSP, como ThemeInit.
  - Con `moderate`, en móvil se prefetchea al tocar (pointerdown) y en escritorio al pasar el ratón 200 ms. Cuesta algo de ancho de banda y un acierto de caché en Cloudflare.
  - En AGENTS §3.3 ya figura como el camino elegido («Speculation Rules inline», fase 13). Navegadores: Chromium sí; Safari y Firefox lo ignoran sin romper nada.
- **Propuesta P7**: añadirlas en `BaseLayout` con la regla de arriba. Excluir `/carrito/`, `/checkout/`, `/cuenta/` y cualquier URL con `?_action=`.
- El **prerender**, con `eagerness: "conservative"`, daría una navegación casi instantánea, pero ejecuta las server islands por adelantado: más carga en Medusa. No lo recomiendo hasta tener la caché de P8.

### 4.7 Revisado y correcto

- **TTFB del servidor** (sin red):
  - estáticas, 1 ms;
  - `/buscar/` 30–60 ms caliente y 120 ms frío (primera búsqueda);
  - sugerencias, 1,5 ms (caché);
  - carrito, 30 ms; checkout, 70 ms; cuenta, 25 ms; deseos, 50 ms.
- **JS**: TBT 0 en todo; `bootup-time` 0,1 s. Bundles dentro de presupuesto (`check:budget`).
- **DOM**: 290–2090 nodos (`/productos/` es el mayor). El adelgazamiento del HTML de los listados ya se midió y descartó (análisis del JS, P3).
- **Fuentes**: precarga solo del 400 de Nunito Sans (13,9 KB), `font-display: swap` y 5 ficheros estáticos.
- **Fotos ocultas del selector** (arnés): no se descargan a tamaño grande. Sí las miniaturas de todos los estampados, que pesan ~1 KB cada una.
- **Caché**: `/_astro/` inmutable en el proxy (Caddy en producción).

## 5. Capacidad (k6, Medusa en 2 núcleos)

Recorrido de `loadtest/k6/tienda.js`: 88 % curiosean (home → listado → ficha, con sus islands), 10 % añaden al carrito y 2 % llegan al checkout; 20 % buscan. Escalones de 60 s.

| Ritmo        | Sin caché: p95 dinámicas / islands | Con caché de 30 s de precio y stock |
| ------------ | ---------------------------------- | ----------------------------------- |
| 10 páginas/s | 279 ms / 79 ms                     | —                                   |
| 20 páginas/s | 571 ms / 111 ms                    | 347 ms / 39 ms                      |
| 25 páginas/s | **9,3 s / 1,75 s** (saturado)      | —                                   |
| 30 páginas/s | 20 s / 4,1 s                       | 292 ms / 39 ms                      |
| 40 páginas/s | 34 s / 8,7 s                       | 398 ms / 41 ms                      |
| 60 páginas/s | —                                  | **719 ms / 57 ms**                  |
| 80 páginas/s | —                                  | 10 s / 1,6 s (saturado)             |

0 errores en todas las tandas; k6 cancela si pasan del 1 %. Las estáticas, siempre ≤ 2,5 ms.

- **Dónde se va la CPU**:
  - A 25 páginas/s, Medusa usa el **105 %** (un núcleo entero: Node es un solo hilo) y Astro el 13 %.
  - Por endpoint (log de Medusa a 15 páginas/s), **el 79,5 % del tiempo** es `GET /store/products` con precio y stock (island `LiveSyncData`): 879 peticiones, p50 45 ms.
  - Le siguen añadir al carrito (10 %) y crear carrito (5 %).
  - El perfil de CPU apunta a MikroORM (21 %) y a la serialización de `@medusajs/utils`/`query`.
- **Coste de los campos** (24 productos, sin carga):

| Campos                      | Tiempo |
| --------------------------- | ------ |
| Precio + stock (los de hoy) | 56 ms  |
| Solo precio                 | 36 ms  |
| Solo stock                  | 32 ms  |
| Solo ids                    | 8 ms   |

- **Prueba de la caché**: proxy en `/tmp` delante de Medusa que cachea 30 s esas `GET /store/products`. Así se simula una caché en Astro de las respuestas de `fetchLive`, como la `CardCache` de `/buscar/` (D9).
  - Tasa de aciertos: 65–72 %.
  - Medusa pasa de saturar a ~25 páginas/s a hacerlo a ~70.
- **Comparación con el VPS** (fase 11): allí saturaba a ~20 páginas/s sin Cloudflare. Coincide con estos ~25 en 2 núcleos más rápidos.

**Propuesta P8** (la de más impacto en capacidad):

- Caché por producto de 15–30 s en Astro para `LiveSyncData`: la misma `CardCache` de `/buscar/`, con su TTL propio (`LIVE_SYNC_CACHE_TTL`).
- **Coste**: precio y stock pueden ir hasta 30 s por detrás en el HTML. Carrito y pago siempre usan los de Medusa, así que no hay riesgo de cobrar mal; ya se aceptó para `/buscar/` (D9).
- Encaja con el pendiente «capacidad sin Cloudflare» de la fase 13.

**Propuesta P9** (menor): con P6 (una island por ficha) hay una petición menos por cada vista de ficha.

## 6. Propuestas ordenadas (impacto × coste)

| #   | Propuesta                                                        | Impacto                                         | Coste        | JS cliente |
| --- | ---------------------------------------------------------------- | ----------------------------------------------- | ------------ | ---------- |
| P1  | `fetchpriority="low"` (o similar) en las fotos 2–4 de la galería | 🔴 LCP de fichas en móvil (2,8 → ~2 s esperado) | Muy bajo     | 0          |
| P8  | Caché de 30 s de precio y stock en `LiveSyncData`                | 🔴 Capacidad ×2,5 (25 → 60 páginas/s)           | Bajo         | 0          |
| P7  | Speculation Rules (prefetch `moderate`)                          | 🟠 −500 ms de listado a ficha                   | Bajo         | 0 (JSON)   |
| P2  | Ancho de 720 px en la foto principal                             | 🟡 −15 % de bytes de la LCP                     | Muy bajo     | 0          |
| P6  | Una sola `LiveSyncData` por ficha                                | 🟡 −1 petición por ficha                        | Medio        | 0          |
| P3  | `srcset` en los logos                                            | 🟡 −5–15 KB por primera visita                  | Bajo         | 0          |
| P5  | CLS de `/sobre-nosotros/` (fuente de reserva o iconos)           | 🟡 Solo esa página en escritorio                | Bajo         | 0          |
| P4  | CSS inline o crítico                                             | 🟠 LCP −0,5 s en primera visita / +12 KB HTML   | A investigar | 0          |

**Recomendación**:

- Una fase corta («Fase R — rendimiento») con **P1 + P2 + P3 + P5**: imágenes y CLS, medidos con este mismo método.
- **P8 + P6** después, porque tocan la island y los e2e de LiveSync.
- **P7** con su revisión de CSP.
- **P4** solo si tras P1 las fichas siguen por debajo de 99.

## 7. Cómo repetir esta auditoría

```bash
# Datos (una vez): 1000 productos mock con fotos
pnpm --filter backend catalog:mock 1000 && pnpm --filter backend catalog:import catalog/mock
pnpm --filter backend images:mock && pnpm --filter backend images:import .cache/mock-images
pnpm backend:stock:mock
# Backend compilado (sin watcher): .medusa/server no tiene .env, se arranca desde apps/backend
pnpm --filter backend build
DISABLE_MEDUSA_ADMIN=true pnpm --filter backend start
# Storefront y proxy brotli (:4330 → :4331)
pnpm --filter storefront build
cd apps/storefront && set -a && . ./.env && set +a && node scripts/lhci-server.mjs
# Lighthouse: lhci collect con una configuración propia (numberOfRuns ≥ 5; --preset=desktop para escritorio)
# Capacidad: Medusa en 2 núcleos (taskset -cp 0,1 <pid> y sus hilos) y loadtest/k6/tienda.js con BASE=http://localhost:4331
```

Notas:

- Medir siempre con la mediana de ≥ 5 pasadas: una sola pasada varía ±1–3 puntos (el 98 que originó esta auditoría).
- Las páginas on-demand necesitan el `.env` del storefront en el proceso del proxy, porque `lhci-server.mjs` no lo carga.
- Las cookies de una cuenta de prueba, con `--extra-headers`.

## 8. Estado de los datos locales

- Catálogo local: **1068 productos** (1000 mock). Se queda así, como pidió el usuario.
- `apps/backend/catalog/mock/productos.csv` regenerado con 1000 productos (ignorado por git).
- `.cache/mock-images`: 4000 fotos, 1,5 GB más, fuera de git.
- Caché de imágenes del build (`node_modules/.astro`): con las 2800 fotos nuevas, el siguiente build vuelve a tardar ~1 min.
- La cuenta de prueba `perf-*@example.com` tiene un carrito y la lista de deseos; se puede borrar.
