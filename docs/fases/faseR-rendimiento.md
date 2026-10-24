# Fase R (rendimiento) — imágenes, CLS, cachés de precio y stock

> **Estado:** ✅ completada (24-oct-2026)
> **Rama/PR:** `perf/fase-r1-imagenes` (R-1, sobre la auditoría) → `perf/fase-r2-cache` (R-2) · PR única con la auditoría
> **Anterior:** [Auditoría de rendimiento](./auditoria-rendimiento.md) · **Siguiente:** por definir

Aplica las propuestas de la [auditoría de rendimiento](./auditoria-rendimiento.md) §6 en el orden que eligió el usuario:

1. **R-1**: P1 + P2 + P3 + P5 (imágenes y CLS), medido frente a la auditoría.
2. **R-2**: P8 + P6 (caché de precio y stock, una island por ficha), comparando cuatro configuraciones de caché.
3. **R-3**: P7 (Speculation Rules) con revisión de CSP; P4 (CSS inline) solo si las fichas no llegan a 99.

## 1. Objetivos

- [x] **R-1** P1 fotos 2+ de la galería con prioridad baja; P2 720 px; P3 logos 1×/2×; P5 CLS de «Sobre nosotros».
- [x] **R-2** caché de Medusa (Redis, experimental) + caché de Astro de `LiveSyncData` + una island por ficha; comparación de las cuatro combinaciones; análisis con Cloudflare delante (§4).
- [x] **R-3** P7 + CSP.
- [x] **R-3b** P4: CSS dentro del HTML.
- [x] Cierre: README §13, ESTADO, PENDIENTES, AGENTS (§3.3 y §4).

## 2. Qué se ha hecho

### 2.1 R-1 (imágenes y CLS)

- **P1** (`ProductImage.astro` prop `low`, `ProductGallery.astro`): las fotos 2.ª y siguientes de la galería salen con `fetchpriority="low"`. El carrusel horizontal está dentro del viewport, así que `loading="lazy"` no las frena: el navegador las bajaba a la vez que la LCP.
  - A/B probados con proxies: `content-visibility: auto` en las fotos ocultas daba CLS (descartado); precargar la LCP no mejoraba.
- **P2** (`lib/images.ts`): `IMAGE_PRESETS.detail.widths` = `[640, 720, 960, 1200]` (antes 800 en lugar de 720). El móvil típico (≈ 376 px CSS × DPR 1,75 = 658 px) pedía 800; ahora 720.
- **P3** (`SiteHeader.astro`, `SiteFooter.astro`, `public/`): `simbolo-header.webp` 1×/2×/3× (1,5 / 3,4 / 5,7 KB; antes siempre 6,8 KB) y `logo-pie.webp` 1×/2× (6,6 / 15,5 KB; antes 16,6 KB), regenerados con sharp desde `src/assets/marca`.
- **P5** (`BaseLayout.astro`): precarga también del **700** de Nunito Sans. El `<strong>` de «Sobre nosotros» llegaba tarde y cambiaba los saltos de línea (CLS 0,05 en escritorio). `font-display: optional` era peor (0,092). AGENTS §3.3 actualizado (precarga de 400 y 700).
- e2e (`interficie.spec.ts`): solo la 1.ª foto con prioridad alta, `720w` en el `srcset`, logos `@2x`. `carrito.spec.ts`: el test del granel busca la tarjeta en la página de snacks donde esté (con 1000 mock hay varios «Premios Plus»).

**Resultado R-1** (Lighthouse 12.6.1, mediana de 5, igual que la auditoría):

| Página                        | Auditoría       | R-1                  |
| ----------------------------- | --------------- | -------------------- |
| Móvil, ficha champú           | 96 · LCP 2,78 s | **97** · LCP 2,63 s  |
| Móvil, ficha pienso / premios | 95 · LCP 2,86 s | **96** · LCP 2,71 s  |
| Móvil, ficha clicker          | 99 · LCP 1,96 s | **100** · LCP 1,81 s |
| Escritorio, «Sobre nosotros»  | CLS 0,05        | **CLS 0,002**        |
| Resto                         | 99–100          | 99–100 (igual)       |

- La precarga del 700 no empeora el móvil: en una repetición de 7 pasadas con y sin ella, las fichas dan 98 = 98 (una tanda anterior con 96–97 fue ruido de la máquina).

### 2.2 R-2 (cachés de precio y stock, una island por ficha)

- **Caché de Medusa** (`medusa-config.ts`): el módulo de caché con Redis ya estaba registrado (fase 7) pero sin el _feature flag_. Ahora `MEDUSA_FF_CACHING=true` en `.env.example`, `docker/compose.prod.yml` (server y worker) y `docker/.env.prod.example`, con **`MEDUSA_CACHE_TTL` = 60 s** (opción `ttl` del módulo; por defecto 1 h).
  - **Los scripts que escriben catálogo o stock vacían la caché al terminar** (`src/scripts/lib/clear-cache.ts`: `stock:mock`, `catalog:import`, `correas-sync`, `images:import` salvo `dry-run`). Motivo en §3.
- **P8, caché de Astro** (`lib/medusa.ts`, `getPricedProductsFresh`): `CardCache` por producto (la de `/buscar/`, fase 7 D9) con **`LIVE_SYNC_CACHE_TTL` = 15 s** (`astro:env`, `secret` para leerla en runtime; 0 = desactivada), 2000 entradas. La usan todas las `LiveSyncData` (listados, home, ofertas, ficha y relacionados).
- **P6, una island por ficha** (`[handle].astro`, `LiveSyncData.astro`, `RelatedProducts.astro`): la ficha manda `productId` + `relatedKey` (clave del bloque de relacionados en el manifiesto de listados) y la island devuelve el producto con sus variantes y las tarjetas de los relacionados en **una sola petición** a Medusa. `RelatedProducts` ya no lleva su `LiveSync`. Se elimina `getPricedProduct`.
  - e2e (`relacionados.spec.ts`): una sola `LiveSyncData` por ficha y con datos de cada tarjeta relacionada.

**Resultado R-2 en Lighthouse** (mediana de 5, con las dos cachés; P6 es lo único que cambia la página):

| Página                               | Auditoría        | R-1              | R-2                  |
| ------------------------------------ | ---------------- | ---------------- | -------------------- |
| Móvil, ficha champú                  | 96 · 2,78 s      | 97 · 2,63 s      | **98** · 2,48 s      |
| Móvil, ficha pienso / premios        | 95 · 2,86 s      | 96 · 2,71 s      | 96 · 2,71 s          |
| Móvil, ficha clicker                 | 99 · 1,96 s      | 100 · 1,81 s     | 99 · 1,81 s (ruido)  |
| Escritorio, fichas                   | 100 · 535–568 ms | 100 · 550–569 ms | 100 · **469–531 ms** |
| Resto (móvil 99–100, escritorio 100) | =                | =                | =                    |

- P6 quita una petición de la ficha: en escritorio el LCP de las fichas baja ~40–80 ms. En móvil, pienso y premios siguen en 96: su LCP lo marca la foto, no las islands (R-3 / P4).
- `/buscar/` da SEO 69 porque es `noindex` (igual desde la auditoría; Lighthouse lo penaliza y es lo correcto).

### 2.3 R-3 (Speculation Rules y CSS inline)

- **P7** (`src/lib/speculation.ts`, `SpeculationRules.astro` en el `<head>` de `BaseLayout`): `<script type="speculationrules">` con `prefetch` `moderate` de `/producto/*`, `/categoria/*`, `/productos/*` y `/ofertas/*`, excluyendo cualquier URL con `_action=`. Es JSON, no JS: `check:budget` lo excluye del JS inline, como el JSON-LD. Su hash se registra en la CSP con `Astro.csp.insertScriptHash` (comprobado: el hash está en el `<meta>` y Chromium no da violaciones).
  - Solo `prefetch`, no `prerender`: no ejecuta las server islands de lo que no se llega a abrir.
  - e2e (`interficie.spec.ts`, con JS): las reglas están, al pasar el ratón por una tarjeta Chromium pide la ficha con `Sec-Purpose: prefetch` y no hay errores de CSP. Sin JS Chromium no las aplica (comprobado).
  - Lighthouse no lo nota (mide una carga suelta, sin navegación previa). La mejora es la de la auditoría §4.6: de 2680 a 2187 ms del toque al `<h1>` de la ficha en móvil.
- **P4, investigación** (fichas de móvil aún en 96–97): proxy A/B que mete el CSS de `/_astro/` dentro del HTML (`<style>`), mismo build, mediana de 5:

| Ficha (móvil) | CSS enlazado (hoy) | CSS inline           |
| ------------- | ------------------ | -------------------- |
| champú        | 98 · LCP 2,34 s    | **100** · LCP 1,88 s |
| pienso        | 97 · LCP 2,49 s    | **100** · LCP 1,88 s |
| premios       | 97 · LCP 2,56 s    | **99** · LCP 2,03 s  |
| clicker       | 100 · LCP 1,81 s   | 100 · LCP 1,50 s     |

- **Coste**: +9,5 KB brotli en **cada** HTML (ficha 13,1 → 22,7 KB; home 15,2 → 24,6 KB; categoría 17,3 → 26,7 KB). El CSS ya no se reutiliza de la caché del navegador entre páginas: cada navegación descarga esos 9,5 KB de nuevo (con P7 se descargan antes del toque).
- La ficha espera hoy al CSS (11,5 KB, bloqueante) antes de pintar la foto, aunque la foto ya ha llegado.

**Recorrido real** (Playwright + Chromium, red limitada por CDP, no simulada; CPU 4×; viewport móvil; 10 repeticiones, mediana). Categoría con caché vacía → toque en una tarjeta → ficha → toque en un relacionado → otra ficha. Proxies sobre el mismo build: CSS enlazado o inline, con o sin Speculation Rules (P7). Tiempo del toque al LCP de cada página, en ms:

| 4G lento (150 ms, 1,6 Mbps) | Enlazado + P7 (hoy) | Enlazado sin P7 | **Inline + P7** | Inline sin P7 |
| --------------------------- | ------------------- | --------------- | --------------- | ------------- |
| 1. Categoría en frío (LCP)  | 844                 | 852             | **708**         | 712           |
| 2. Toque → 1.ª ficha        | 721                 | 875             | **490**         | 748           |
| 3. Toque → 2.ª ficha        | 834                 | 998             | **818**         | 1069          |
| **Total**                   | 2399                | 2725            | **2016**        | 2530          |

| 4G normal (40 ms, 9 Mbps) | Enlazado + P7 | Enlazado sin P7 | Inline + P7 | Inline sin P7 |
| ------------------------- | ------------- | --------------- | ----------- | ------------- |
| Total de las 3 páginas    | 1158          | 1334            | 1162        | 1393          |

- **En 4G lento con P7, inline gana en las tres páginas** (−16 % en total). La primera página gana 140 ms, no los ~500 ms que estimaba Lighthouse (su red es simulada y penaliza más cada petición).
- **Sin P7** (Safari y Firefox no aplican las Speculation Rules), la 2.ª ficha sale **71 ms más lenta** con inline: su CSS ya estaba en caché y se descarga otra vez. La 1.ª ficha gana igualmente, porque su CSS propio (`_handle_.css`) aún no estaba en caché.
- **En 4G normal da igual** (±4 ms con P7; +59 ms en 3 páginas sin P7).
- Bytes: +13–18 KB por navegación.
- P7 por sí solo: −326 ms en 3 páginas con el CSS enlazado (2725 → 2399) en 4G lento.

**¿Se puede reducir el CSS?** (`BaseLayout.css`: 63 KB, **10,1 KB brotli**):

- utilidades de Tailwind: 4,6 KB br, con solo 16 de 394 reglas sin uso (0,4 KB): Tailwind ya genera solo lo usado;
- preflight 1,1 KB, `@media` 1,1 KB, `@property` 0,5 KB (los necesita Tailwind 4), variables de tema 1,1 KB;
- componentes propios (popovers, menú, avisos, carrusel, filtros…): 0,1–0,5 KB cada uno;
- `tw-animate-css` casi no aporta (solo sus `@property`).
- Conclusión: no hay grasa. Recortar más (dividir el CSS por página) ahorraría 1–2 KB y complicaría el build. No compensa.

**Decisión del usuario: aplicar A** (`build.inlineStylesheets: "always"` en `astro.config.mjs`). Revisiones:

- **CSP**: Astro calcula y registra el hash de cada `<style>` (en el `<meta>` de las estáticas y en la cabecera de las on-demand). Comprobado con un script sobre home, categoría, fichas (normal, correa y landing), «Sobre nosotros» y 404 (61 bloques inline, 0 sin hash) y en Chromium (home → ficha → carrito → checkout, búsqueda, entrar): **0 violaciones**. Sin atributos `style=`.
- **Ya no hay ningún `<link rel="stylesheet">`**: entra también el CSS propio de la ficha (`_handle_.css`).
- **`check:budget`** buscaba `data-drag-scroll` y `data-correa=` en todo el HTML y ahora los encontraba en el CSS inline (17 falsos positivos): mira solo atributos de etiquetas.
- e2e: 220 pasan; fallan los 3 de la correa de 7 m de siempre (§10).

### 2.4 Resultado final (Lighthouse 12.6.1, mediana de 5, R-1 + R-2 + R-3)

| Página (móvil)                                               | Auditoría                          | R-2         | **Final**                                         |
| ------------------------------------------------------------ | ---------------------------------- | ----------- | ------------------------------------------------- |
| Home                                                         | 99 · LCP 2,03 s                    | 99 · 2,04 s | **100** · 1,51 s                                  |
| `/productos/`, categorías, ofertas                           | 99 · 1,81–2,03 s                   | 99          | **100** · 1,51–1,81 s                             |
| Ficha clicker / arnés                                        | 99 · 1,81–1,96 s                   | 99          | **100** · 1,43–1,51 s                             |
| Ficha champú                                                 | 96 · 2,78 s                        | 98 · 2,48 s | **99** · 1,88 s                                   |
| Ficha pienso                                                 | 95 · 2,86 s                        | 96 · 2,71 s | **99** · 1,96 s                                   |
| Ficha premios (granel)                                       | 95 · 2,86 s                        | 96 · 2,71 s | **99** · 1,88 s                                   |
| `/buscar/` (3 variantes)                                     | 99                                 | 99          | **100** · 1,43–1,51 s                             |
| Correa (color)                                               | 100 · 1,66 s                       | 100         | 99 · 1,66 s (FCP 1,06 → 1,51 s en 3 de 5 pasadas) |
| Correa a medida, «Sobre nosotros», carrito, checkout, cuenta | 100                                | 100         | 100                                               |
| **Escritorio**: todas                                        | 100 (CLS 0,05 en «Sobre nosotros») | 100         | **100**, CLS ≤ 0,004                              |

- Todas las páginas en **99–100** en móvil (antes, tres fichas en 95). CLS ≤ 0,004 en todo.
- La ficha de la correa por color no tiene foto: su LCP es texto. Su FCP cae en dos grupos (1,1 y 1,5 s), un salto de la red simulada de Lighthouse con el HTML de 24 KB; LCP igual que antes. Se acepta.

## 3. Caché de Medusa: cómo se invalida (probado en 2.21.2)

- Se invalida por **eventos**: la estrategia del módulo (`@medusajs/caching`, `utils/strategy.js`) se suscribe a `*` en el bus de eventos y borra las entradas con las etiquetas de la entidad que cambia. La consulta de stock (`getVariantAvailability`) etiqueta por variante, enlaces y `ReservationItem`.
- Probado con la Store API (`GET /store/products` con `+variants.inventory_quantity`):

| Cambio                                                                   | ¿Se ve al momento?                               |
| ------------------------------------------------------------------------ | ------------------------------------------------ |
| Stock desde el Admin (`POST /admin/inventory-items/…/location-levels/…`) | ✅ sí                                            |
| Pedido pagado (e2e de checkout, reserva)                                 | ✅ sí (24 → 23… al instante)                     |
| Stock desde un script `medusa exec` (`updateInventoryLevelsWorkflow`)    | ❌ **no**: seguía en 20 con 30, 45 y 80 en la BD |

- El `medusa exec` emite sus eventos en su propio proceso, que no tiene la estrategia de invalidación del servidor (ni el log del servidor muestra `inventory-level.updated`). Sin más, la tienda mostraría el dato viejo hasta que caduque la entrada.
- **Solución**: los scripts llaman a `clear({ tags: ["*"] })` al terminar (caching-redis `flush`: borra las claves con su prefijo `mc:`) y el TTL baja a 60 s como red de seguridad para cualquier otra escritura sin evento.
- Experimental: Medusa lo marca «[WIP]» (`feature-flags/caching.js`). Aceptado por el usuario antes del lanzamiento. Para quitarla: `MEDUSA_FF_CACHING=false` (sin rebuild).

## 4. Capacidad: las cuatro configuraciones

Mismo build (R-2), mismo recorrido k6 que la auditoría (`loadtest/k6/tienda.js`), **Medusa en 2 núcleos** (`taskset`, como el CPX22) y Astro en otros 2, **sin Cloudflare** (k6 directo a Astro). Medusa reiniciado y Redis vacío antes de cada configuración. Escalones de 60 s. Cifras: p95 de las páginas dinámicas (carrito, checkout, búsqueda) / p95 de las server islands.

| páginas/s                           | A: ninguna     | B: solo Medusa | C: solo Astro (15 s) | **D: las dos** |
| ----------------------------------- | -------------- | -------------- | -------------------- | -------------- |
| 20                                  | 504 ms / 92 ms | 284 / 41       | 289 / 37             | **280 / 33**   |
| 30                                  | ✗ 14 s / 3 s   | 300 / 39       | 287 / 38             | **274 / 30**   |
| 40                                  | ✗              | 509 / 65       | 361 / 39             | **269 / 29**   |
| 60                                  | ✗              | ✗ 2,1 s / 307  | 462 / 44             | **350 / 34**   |
| 80                                  | ✗              | ✗ 23 s         | 1,2 s / 78           | **513 / 37**   |
| 100                                 | ✗              | ✗              | ✗ 56 s               | **726 / 60**   |
| 120                                 |                |                |                      | ✗ 25 s         |
| **Límite aproximado**               | **~25**        | **~50**        | **~85**              | **~100**       |
| CPU de Medusa (todos los escalones) | 611 s          | 416 s          | 313 s                | **243 s**      |

✗ = saturado (p95 de segundos, visitas descartadas). 0 errores HTTP salvo A a ≥ 60 páginas/s (0,06–0,13 %).

- **Ganan las dos juntas**: ×4 de capacidad sin Cloudflare (25 → 100 páginas/s) y islands en 30–60 ms.
- Se complementan: la de Astro evita la llamada (acierta por producto aunque cambie la página: cada producto sale de media en 5 listas del manifiesto, §5.2); la de Medusa abarata lo que se escapa (56 → 22 ms una consulta de 24 productos) y además cachea partes de **carrito y checkout** (precios de variantes, regiones, opciones de envío: `core-flows` 2.21.2 usa `cache` en 17 sitios), que la de Astro no toca.
- Redis: ~20 000 claves (~15 MB) tras cada tanda. Sin errores.
- A 120 páginas/s el cuello pasa a ser otro (carrito, búsqueda y Astro). No se investiga: es 10 veces el pico previsto.

## 5. ¿Sirve con Cloudflare delante? (análisis del despliegue real)

Pregunta del usuario: en producción Cloudflare ya cachea; ¿la doble caché sirve de algo o es trabajo que no se nota?

### 5.1 Qué cachea Cloudflare hoy (fase 11)

| Respuesta                                | Cabecera                                                      | En Cloudflare                                            |
| ---------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------- |
| HTML estático (home, listados, fichas)   | `public, max-age=0` → Caddy: `s-maxage=86400`                 | 24 h (hasta la purga del despliegue)                     |
| `LiveSyncData`                           | `public, max-age=30, s-maxage=60, stale-while-revalidate=300` | 60 s fresca + 300 s sirviendo la vieja mientras revalida |
| `/buscar/`, parcial, sugerencias         | `s-maxage=60, stale-while-revalidate=300`                     | igual                                                    |
| `HeaderState`, carrito, checkout, cuenta | `private, no-store`                                           | **nunca** (siempre al VPS)                               |

- Cloudflare guarda la island **por URL**: la URL lleva las props cifradas (`productId`/`pageKey`), así que hay **una entrada por ficha y por página de listado**, no por producto.
- La caché es **por centro de datos** (en España, Madrid y Barcelona, a veces otros). Sin Tiered Cache, cada uno pide su copia al origen.
- Desde feb-2026 el `stale-while-revalidate` de Cloudflare es **asíncrono** (cloudflare-docs, changelog 2026-02-26): con la entrada caducada sirve la vieja al visitante (`UPDATING`) y revalida en segundo plano. Nadie espera al VPS por una island caducada.

### 5.2 Qué llega al VPS con Cloudflare

Con 1033 productos hay ~1060 fichas y 550 claves de listado (páginas de categoría, ofertas, home, relacionados). Cada URL de island caduca a los 60 s y, tras 300 s más sin visitas, sale de la caché.

- **Tráfico concentrado** (un anuncio, todo el mundo entra en la home y en 20 fichas): Cloudflare lo absorbe casi todo. Cada island popular llega al VPS **una vez por minuto y centro de datos**. Aquí las cachés del VPS **apenas aportan**: lo que llega ya es poco (es la tanda A de la fase 11: 50 páginas/s con el VPS al 60 %, sin estas cachés).
- **Tráfico disperso** (buscadores, catálogo largo, cada visitante en una ficha distinta): la mayoría de las URL de island son **MISS** (primera visita en 6 minutos). Ahí Cloudflare no ayuda y todo llega al VPS. **La caché de Astro sí**, porque es **por producto**: la ficha A, el listado X y los relacionados de la ficha B piden el mismo producto (media de 5,2 listas por producto en el manifiesto; hasta 27). Con 15 s, un producto popular se pide a Medusa ≤ 4 veces/min aunque aparezca en 30 URL distintas.
- **Lo que Cloudflare nunca cachea** (`HeaderState` en cada página, carrito, checkout, cuenta): va siempre al VPS. La caché de Astro no lo toca; **la de Medusa sí ayuda** (regiones, precios de variantes y opciones de envío en `addToCart`/`updateCart`/`completeCart`). En la auditoría, añadir y crear carrito eran el 15 % del tiempo de Medusa.
- **Tras cada despliegue** se hace _Purge Everything_ (fase 11 §4.3): durante unos minutos todo es MISS y la primera oleada llega entera al VPS (el escenario de la tanda B, que saturaba a ~20 páginas/s). Las cachés del VPS amortiguan ese arranque en frío.
- **Si Cloudflare falla, se desactiva o se cambia** (DNS a gris por un problema, otro CDN, un bot que esquiva la caché con parámetros): el VPS pasa de ~20–25 a ~100 páginas/s.

### 5.3 Simulación con un «Cloudflare» local

Para no quedarse en el razonamiento: proxy en `/tmp/perf/cfsim.mjs` (fuera del repo) que imita un centro de datos de Cloudflare con la Cache Rule de la fase 11 (respeta `s-maxage`, SWR asíncrono, HTML 24 h, `private`/`no-store`/`Set-Cookie` al origen). Mismo k6, mismas fichas al azar del sitemap (tráfico disperso: ~1060 fichas).

Primero, **caché caliente** (las cuatro configuraciones, escalones de 20, 40 y 60 páginas/s seguidos, con el «Cloudflare» ya lleno de la tanda anterior):

| páginas/s                    | A: ninguna | B: solo Medusa | C: solo Astro | D: las dos |
| ---------------------------- | ---------- | -------------- | ------------- | ---------- |
| 20                           | 264 / 39   | 253 / 40       | 261 / 36      | 253 / 34   |
| 40                           | 308 / 35   | 364 / 34       | 363 / 32      | 352 / 30   |
| 60                           | 500 / 2    | 352 / 2        | 377 / 2       | 426 / 2    |
| CPU de Medusa (las 3 tandas) | 106 s      | 104 s          | 99 s          | 100 s      |

p95 de las dinámicas / de las islands, en ms. 0 errores. Las estáticas, ≤ 1,4 ms (HIT).

- Con Cloudflare caliente, **las cuatro dan lo mismo**: Medusa gasta ~6 veces menos CPU que sin Cloudflare (106 s frente a 611 s en A) y no se acerca al límite. La island ya sale de la caché de Cloudflare (p95 2 ms a 60 páginas/s).

Después, **en frío** (Cloudflare vacío, como tras el _Purge Everything_ de cada despliegue; Medusa recién arrancado; una sola tanda de 60 s):

| páginas/s | A: ninguna                            | D: las dos                       |
| --------- | ------------------------------------- | -------------------------------- |
| 80        | 1,33 s / 61 ms                        | **868 ms / 39 ms**               |
| 120       | ✗ **12,2 s** / 632 ms, 43 descartadas | **2,0 s / 38 ms**, 0 descartadas |

- En frío, la doble caché **sí** se nota: con un pico justo después de un despliegue, sin ella el carrito y el checkout tardan 12 s a 120 páginas/s; con ella, 2 s.
- Lo que satura en frío no son las islands (Cloudflare las llena en el primer minuto) sino las **dinámicas** (carrito, checkout, `HeaderState`): las ayuda la caché de **Medusa** (regiones, precios y opciones de envío del carrito), no la de Astro.

Límites de la simulación: es **un** centro de datos (en la realidad, varios y cada uno con su copia: más MISS, más parecido al frío) y el tráfico de k6 es disperso pero se repite en pocos minutos (más HIT que un catálogo visitado a lo largo del día).

### 5.4 Conclusión: ¿sirve en producción?

**En el día a día, apenas.** Con el tráfico previsto (pico de 10–15 páginas/s, fase 11) y Cloudflare caliente, el VPS va sobrado con o sin estas cachés: la tanda A de la fase 11 ya atendía 50 páginas/s al 60 % de CPU sin ellas. Ninguna visita va a notar la diferencia.

**Sirve como seguro**, en tres situaciones reales:

1. **Justo después de cada despliegue** (purga de Cloudflare): la primera oleada llega entera al VPS. Medido: 12 s → 2 s en carrito y checkout a 120 páginas/s.
2. **Si Cloudflare deja de cachear** (incidencia, cambio de reglas, proxy desactivado para depurar, bots con parámetros): la capacidad sin CDN pasa de ~25 a ~100 páginas/s (§4).
3. **Carrito, checkout y cabecera**, que Cloudflare nunca cachea: la caché de Medusa los abarata siempre. Es la parte que más crece con las ventas (cada compra son varias peticiones dinámicas).

**Coste de tenerlas**: bajo. Unas 60 líneas, sin JS de cliente, sin dependencias; precio y stock de las islands hasta 15 s por detrás (la CDN ya los retrasaba hasta 60 s + 300 s de SWR); ~15 MB de Redis. Riesgos acotados: la caché de Medusa es experimental (se apaga con una variable) y los scripts la vacían.

**Decisión propuesta**: dejar D (las dos, como está) y **no invertir más en capacidad** hasta que haya tráfico real que lo pida. Lo que sí mejora la experiencia de cada visita es el frontal (LCP de las fichas, P7, P4).

## 6. Decisiones

| Decisión                                                        | Motivo                                                                              | Fuente                                                                                           |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Caché de Medusa con `MEDUSA_FF_CACHING` aunque sea experimental | Capacidad ×2 por sí sola y cachea carrito y checkout; prelanzamiento (usuario)      | context7 `/medusajs/medusa` (Caching Module, opción `ttl`); código de `@medusajs/caching` 2.21.2 |
| TTL de Medusa 60 s (no 1 h) y vaciado al final de los scripts   | Los eventos de `medusa exec` no invalidan la caché del servidor (§3)                | medido; `caching-redis` `clear`/`flush`                                                          |
| Caché de Astro 15 s (no 30 s)                                   | Con la de Medusa debajo, 15 s ya llega a ~100 páginas/s; menos tiempo de dato viejo | §4                                                                                               |
| Una island por ficha (P6)                                       | −1 petición por ficha; misma consulta a Medusa (o ninguna, con caché)               | auditoría §4.5                                                                                   |
| Precarga del 700                                                | CLS 0,05 → 0,002; sin coste medible en móvil (7 pasadas)                            | §2.1                                                                                             |

## 7. Cómo usarlo

```bash
# Desactivar la caché de Medusa (sin rebuild): en el .env del backend / VPS
MEDUSA_FF_CACHING=false
# TTL de cada caché (runtime)
MEDUSA_CACHE_TTL=60          # backend, segundos
LIVE_SYNC_CACHE_TTL=15       # storefront, segundos; 0 = desactivada
# Vaciar la caché de Medusa a mano (p. ej. tras tocar la BD con SQL)
docker compose --env-file docker/.env -f docker/compose.dev.yml exec -T redis \
  sh -c "redis-cli --scan --pattern 'mc:*' | xargs -r redis-cli unlink"
```

## 8. Cómo testear esta fase

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm --filter storefront check:budget
# e2e contra un Astro aparte (localhost, no 127.0.0.1)
cd apps/storefront && PORT=4400 node --env-file-if-exists=.env dist/server/entry.mjs &
E2E_BASE_URL=http://localhost:4400 pnpm exec playwright test e2e/relacionados.spec.ts e2e/interficie.spec.ts
# Caché de Medusa: el stock cambiado desde el Admin se ve al momento en /store/products;
# tras `pnpm backend:stock:mock` también (el script vacía la caché).
```

## 9. Criterio de salida

- [x] R-1: fichas de móvil mejoran (95–96 → 96–97) y CLS de «Sobre nosotros» < 0,01.
- [x] R-2: capacidad sin Cloudflare ≥ 60 páginas/s (medido ~100) y sin dato viejo tras los scripts.
- [x] R-3: P7 sin violaciones de CSP.
- [x] P4 aplicada (CSS dentro del HTML), CSP sin violaciones.

## 10. Pendientes / riesgos

- `e2e/correas.spec.ts` (medida exacta 7 m) y el checkout de la correa fallan en local por pedidos de prueba que reservan la cuerda (`stock:mock` no repone piezas de la correa). No es de esta fase.
- Caché de Medusa experimental: revisar en cada subida de Medusa (Renovate) que la invalidación siga funcionando (prueba de §3: Admin, pedido, script).
- Una escritura directa en la BD (SQL a mano) no emite eventos: vaciar la caché a mano (§7) o esperar 60 s.
