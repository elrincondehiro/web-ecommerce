# Fase 6 — Ficheros (SeaweedFS local / R2 producción) e imágenes optimizadas

> **Estado:** 🚧 en curso: implementación entregada; falta el experimento A/B de corrección de precio/stock (§7)
> **Rama/PR:** `feat/fase6-ficheros` · PR #…
> **Anterior:** [Fase 3](./fase3.md) · **Siguiente:** Fase 4 (carrito)

## 1. Objetivos

- [x] Módulo de ficheros de Medusa con `file-s3`: SeaweedFS en desarrollo y Cloudflare R2 en producción.
- [x] Importación de fotos por lotes con convención de nombres `handle_XX.jpg` (`_01` = miniatura).
- [x] Fotos de prueba (picsum) para 1000 productos × 4 fotos.
- [x] Storefront: `<Picture>` AVIF/WebP optimizado **en build**, recorte 1:1 y galería sin JS.
- [x] **Patrón nuevo para precio/stock**: se escriben en el HTML del build y una server island invisible los corrige (modo híbrido).
- [x] Medidas a escala real: tiempo de build, `dist/`, caché, peso de página y Lighthouse.
- [x] Subida desde la Admin API visible en la tienda optimizada.
- [x] Fuente: ficheros estáticos en vez de la variable completa (LCP).
- [ ] Experimento final: corrección **A** (solo CSS) y **B** (solo script) frente al híbrido → decidir.

## 2. Qué se ha hecho

**Backend (`apps/backend`)**

| Fichero                                          | Qué                                                                                                                                                                                                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `medusa-config.ts`                               | Módulo `@medusajs/medusa/file` con el proveedor `file-s3` (id `s3`). **Solo se activa si existe `S3_BUCKET`**; si no, Medusa usa el proveedor local (CI, `medusa build`). `acl: false`, `cache_control` inmutable de 1 año y `forcePathStyle` por env. |
| `src/scripts/lib/image-files.ts`                 | Funciones puras: `parseImageFileName`, `planProductImages` (agrupa por handle y ordena por XX) y `sourceFileFromUrl`.                                                                                                                                  |
| `src/scripts/import-images.ts`                   | `images:import <carpeta> [dry-run] [replace]`: sube con `uploadFilesWorkflow` y asocia con `updateProductsWorkflow`. Idempotente.                                                                                                                      |
| `src/scripts/mock-images.ts`                     | `images:mock [N]`: descarga N fotos picsum (2400×1600, semilla `<handle>_<XX>`) por producto `mock-*` a `.cache/mock-images/`, que está ignorado por git.                                                                                              |
| `src/scripts/__tests__/image-files.unit.spec.ts` | Tests del parser y de `sourceFileFromUrl` (7 tests).                                                                                                                                                                                                   |

**Storefront (`apps/storefront`)**

| Fichero                                            | Qué                                                                                                                                                                                                       |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `astro.config.mjs`                                 | `image.remotePatterns` desde `IMAGE_BASE_URL`; sharp con `avif.effort: 2`; Inter en pesos estáticos 400/500/600; `STOREFRONT_MAX_PRODUCTS` (opcional).                                                    |
| `src/components/ProductImage.astro`                | `<Picture>` con `formats` avif+webp, fallback webp, `fit="cover"` 1:1 y presets `card` (320/480/640), `detail` (640/960/1200) y `thumb` (80/160). Si el producto no tiene imagen, usa un placeholder SVG. |
| `src/components/ProductGallery.astro`              | Galería **0 JS**: carrusel con `scroll-snap` y miniaturas que son anclas `#foto-N`. La primera imagen se carga con `eager` + `fetchpriority=high`.                                                        |
| `src/components/ProductCard.astro`, `BuyBox.astro` | Precio, "Desde" y stock **del build** con marcas `data-pid`, `data-stock`/`data-vstock`, `data-if-stock`/`data-if-vstock`, `data-price` y `data-price-from`.                                              |
| `src/components/server/LiveSync.astro`             | Server island **invisible** (sin fallback): devuelve un `<style>` (stock) y un `<script>` inline (precio). Props mínimas: `categoryId`/`offset`/`limit` o `productId`.                                    |
| `src/lib/live-sync.ts` (+ test)                    | Genera la corrección: `liveEntries`, `liveStockCss` y `livePriceScript` (JSON con `<` escapado; ids validados con `^[A-Za-z0-9_-]+$`).                                                                    |
| `src/lib/medusa.ts`                                | `getAllProducts` pide ya los precios de la región ES y el stock, y **memoriza el catálogo** (una descarga por build, que reutilizan home, listados, categorías y fichas).                                 |
| `src/styles/global.css`                            | Reglas base de stock (`[data-stock="in"] [data-if-stock="out"] { display: none }`…).                                                                                                                      |

Se eliminan `PricedProductGrid.astro`, `ProductBuyBox.astro` (pasa a ser el estático `BuyBox.astro`) y `ui/skeleton`, que ya no se usan.

**Otros**

- `packages/config/eslint.config.js`: el parser de TypeScript se fija explícitamente para `.astro`. `eslint-plugin-astro` lo buscaba desde la raíz, donde no existe con el linker aislado de pnpm; por eso `pnpm lint` fallaba también en `main`.
- pnpm 12 pasa `--` como argumento literal a los scripts. Los usos documentados ahora no lo llevan: `seed:mock 100`, `images:mock 2`.

## 3. Decisiones tomadas

| Decisión                                                                                                    | Motivo                                                                                                                                                                                                                                                         | Fuente consultada                                                                                  |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `file-s3` con `acl: false` y bucket con lectura pública                                                     | R2 no admite ACL por objeto; la lectura pública se configura en el bucket (dominio propio). En el futuro, los ficheros privados irán a otro bucket                                                                                                             | código de `@medusajs/file-s3@2.21.2`, cloudflare-docs (R2 public buckets)                          |
| `cache_control: public, max-age=31536000, immutable` en el bucket                                           | Las claves llevan ULID, así que nunca se reescriben. Astro respeta esa cabecera al cachear los derivados                                                                                                                                                       | código de `file-s3`; astro-docs (asset caching)                                                    |
| Importación por lotes con script propio (`medusa exec`), no con el CSV                                      | El CSV de Medusa acepta URLs de imagen, pero no copia los ficheros al bucket. El script sube y asocia en un solo paso                                                                                                                                          | context7 `/medusajs/medusa` (product import, `uploadFilesWorkflow`, `updateProductsWorkflow`)      |
| Idempotencia por `metadata.source_file` **y** por el nombre en la URL (`<nombre>-<ULID>.jpg`)               | Si se guardan las imágenes desde la Admin API, Medusa las recrea **sin metadata** (comprobado). El nombre de la URL sirve de respaldo, así no se duplican al reimportar                                                                                        | prueba manual (§5)                                                                                 |
| Imágenes optimizadas **en build** con `<Picture>` (no en el servidor ni en un CDN de imágenes)              | 0 trabajo en runtime; `/_astro/*` inmutable. Cloudflare Images queda como posible cambio en producción si el build se hace largo                                                                                                                               | astro-docs (images: Picture, widths/sizes, fit, remotePatterns)                                    |
| AVIF + WebP, **fallback WebP** (sin JPEG)                                                                   | Navegadores evergreen (AGENTS §3.3). Con JPEG serían un 50 % más de transformaciones                                                                                                                                                                           | astro-docs (Picture: `formats`, `fallbackFormat`)                                                  |
| **`avif.effort: 2`** (sharp usa 4 por defecto)                                                              | Primer build 5 veces más rápido y AVIF solo un 3–4 % más pesados (tabla §5.2)                                                                                                                                                                                  | astro-docs (`image.service.config.avif`, desde 6.1.0) + medición                                   |
| Calidad por defecto de sharp (AVIF 50, WebP 80), sin `quality`                                              | Los alias `low`/`mid` de Astro (25/50) se aplican igual a todos los formatos y para WebP son demasiado bajos                                                                                                                                                   | código de `astro/assets/services/sharp`                                                            |
| **Precio y stock en el HTML del build + server island que corrige** (modo híbrido)                          | Sin JS o sin island se ve un precio real (SEO y accesibilidad); no hace falta skeleton; una sola petición pequeña (~0,9 KB gzip). El checkout siempre usa el precio de Medusa. Cumple AGENTS §3.2: el HTML es el fallback y la island trae el valor definitivo | propuesta del usuario; astro-docs (server islands, caching); runtime de islands de Astro 7.3.5     |
| Stock vía `<style>` (sin JS); precio vía `<script>` inline                                                  | El texto de precio en CSS (`content:`) no es accesible; el stock sí se resuelve mostrando u ocultando con CSS                                                                                                                                                  | MDN (`content` y accesibilidad)                                                                    |
| `Cache-Control` de la island: `public, max-age=30, s-maxage=60, stale-while-revalidate=300`                 | Atrás/adelante sin pedir de nuevo; CDN corto. Nada de localStorage                                                                                                                                                                                             | AGENTS §3.3                                                                                        |
| Inter **estática 400/500/600** (24 KB cada una) en vez de la variable 100–900 (72 KB); preload solo del 400 | La precarga de 72 KB competía con la imagen LCP. Quitar el preload provoca un CLS de 0,33 (tabla §5.3)                                                                                                                                                         | astro-docs (Fonts API: `weights`, `preload` por peso, `display`, fallbacks optimizados) + medición |
| `font-display: swap` (por defecto) y no `optional`                                                          | Con preload y fallback de métricas ajustadas, `swap` ya da CLS 0. `optional` no mejora y en una conexión lenta podría quedarse en Arial en la primera visita                                                                                                   | astro-docs (`font.display`) + medición                                                             |
| Catálogo memoizado en `getAllProducts`                                                                      | Antes, una descarga por categoría; ahora una por build                                                                                                                                                                                                         | —                                                                                                  |

## 4. Cómo usarlo

```bash
# Backend: variables S3_* en apps/backend/.env (ver .env.example)
pnpm --filter backend images:import <carpeta> dry-run   # qué haría
pnpm --filter backend images:import <carpeta>           # sube y asocia (idempotente)
pnpm --filter backend images:import <carpeta> replace   # sustituye las fotos del producto

# Catálogo de prueba completo (solo dev)
pnpm --filter backend seed:mock 1000
pnpm --filter backend images:mock            # 4 fotos por producto → .cache/mock-images (~1,5 GB)
pnpm --filter backend images:import .cache/mock-images

# Storefront
pnpm --filter storefront build                           # 1.ª vez lenta; después solo lo nuevo
STOREFRONT_MAX_PRODUCTS=100 pnpm --filter storefront build   # subconjunto rápido
HOST=0.0.0.0 PORT=4321 node --env-file-if-exists=.env apps/storefront/dist/server/entry.mjs   # prueba en LAN
```

- **Convención de nombres:** `<handle>_<XX>.jpg|jpeg`, con XX = 01–99. `_01` es la miniatura. Los nombres que no la siguen se ignoran y se informa de ellos.
- **Cambiar o añadir una foto** (Admin o lote) requiere **rebuild** para que aparezca optimizada. Será manual hasta el webhook de la fase 13. El rebuild solo transforma las fotos nuevas.

## 5. Cómo testear esta fase

```bash
pnpm infra:up && pnpm dev:backend
pnpm --filter backend test                     # 7 tests (parser, sourceFileFromUrl)
pnpm --filter storefront test                  # live-sync (CSS/script de corrección)
pnpm lint && pnpm format:check && pnpm typecheck && pnpm build
pnpm --filter storefront check:budget          # 0 bundles JS en todas las páginas
curl -sI http://localhost:8333/medusa/<clave>.jpg | grep -i cache-control   # immutable
```

Comprobaciones manuales hechas:

- **Subida por la Admin API** (`POST /admin/uploads` + `POST /admin/products/:id`, el mismo flujo que la Admin): la foto queda en el bucket con `Cache-Control` inmutable. La Store API la devuelve, y el rebuild transformó **solo esas 10 variantes** (44 000 reutilizadas, 21 s). Después, `images:import` no duplicó nada.
- **Idempotencia:** reimportar las 4000 fotos sube 0.
- **La island responde en el build real:** 200, 937 B gzip, con el `Cache-Control` indicado.

### 5.1 Volumen de prueba

1000 productos mock × 4 fotos picsum (2400×1600, unos 370 KB de media): 1,5 GB descargados en 1 min 57 s. La importación tardó 37 s y en el bucket ocupan 1,56 GB.

### 5.2 Build: `avif.effort` (100 productos, 4400 transformaciones, sin caché)

| effort          | Build en frío  | Con caché | `dist/` | Peso medio AVIF / WebP |
| --------------- | -------------- | --------- | ------- | ---------------------- |
| 4 (por defecto) | 14 min 41 s    | 2,8 s     | 185 MB  | 27 / 53 KB             |
| **2**           | **2 min 55 s** | 2,8 s     | 189 MB  | 28 / 53 KB             |
| 0               | 1 min 30 s     | 2,8 s     | 191 MB  | 29 / 53 KB             |

**1000 productos con effort 2:** 44 000 transformaciones y 1089 páginas, todas con 0 bundles JS.

| Medida                      | Valor          |
| --------------------------- | -------------- |
| Primer build sin caché      | **29 min 3 s** |
| Rebuild con caché           | **20–21 s**    |
| `dist/`                     | 1,9 GB         |
| Caché `node_modules/.astro` | 2,0 GB         |

### 5.3 Lighthouse móvil: fuente (100 productos, 5 pasadas, mediana)

| Variante                                    | Home: LCP · CLS | Listado: LCP · CLS | Ficha: LCP · CLS | Perf    |
| ------------------------------------------- | --------------- | ------------------ | ---------------- | ------- |
| Variable 72 KB + preload (antes)            | 2,11 s · 0      | 2,33 s · 0         | 1,81 s · 0       | 98–100  |
| Variable sin preload                        | 2,11 s · 0,33   | 1,81 s · 0,33      | 1,50 s · 0,33    | 83–84   |
| **Estática 400/500/600 + preload 400**      | **1,58 s · 0**  | **1,73 s · 0**     | **1,66 s · 0**   | **100** |
| Estática sin preload                        | 1,73 s · 0,33   | 1,81 s · 0,33      | 2,56 s · 0,33    | 81–84   |
| Estática + preload 400 + `display:optional` | 1,58 s · 0      | 1,88 s · 0         | 1,73 s · 0       | 100     |

- La causa del CLS de 0,33 sin preload es "Web font loaded": el texto se recoloca al cambiar de fuente.
- **La compresión no ayuda con las fuentes:** woff2 ya va comprimido con Brotli. Al aplicarle gzip pesa lo mismo o más (72 920 → 72 944 B), así que lo que reduce peso es enviar menos glifos o pesos.

**Final (1000 productos, configuración elegida, 3 pasadas):**

| Página  | Perf · A11y · BP · SEO   | LCP         | CLS   |
| ------- | ------------------------ | ----------- | ----- |
| Home    | 100 · 100 · 100 · 100    | 1,58–1,75 s | 0,000 |
| Listado | 98–100 · 100 · 100 · 100 | 1,88–2,19 s | 0     |
| Ficha   | 99–100 · 100 · 100 · 100 | 1,66–2,26 s | 0,000 |

Pesos: la home unos 250 KB y el listado unos 510 KB (24 tarjetas, el grueso son imágenes lazy), medidos con effort 2 y la fuente anterior. La ficha (4 fotos) unos 314 KB. Las fotos picsum ya vienen muy comprimidas; con fotos reales de réflex el peso será algo mayor.

## 6. Criterio de salida

- [x] Subida desde Admin visible en la tienda optimizada (tras rebuild).
- [x] Lighthouse móvil ≥ 95 en home, listado y ficha con 1000 productos; CLS < 0,05.
- [x] 0 bundles JS (`check:budget`) y JS inline ≤ 1 KB gzip.
- [ ] Decisión sobre el modo de corrección (híbrido / A / B) tras el experimento.

## 7. Pendientes / riesgos

- **Experimento A/B** (rama de test): A = solo CSS (el precio también por CSS), B = solo script (stock también por script) frente al híbrido actual. Se medirá el peso de la respuesta, el JS inline, la accesibilidad y la compatibilidad con CSP con nonce.
- **LCP del listado ~1,9–2,2 s** (presupuesto 1,8 s). Causa sin analizar todavía (la imagen LCP pesa 18–30 KB y el CSS 27 KB). Se revisa en la fase 13, junto con las cabeceras de Caddy: en local no hay compresión ni caché inmutable (`max-age=0` en el servidor Node).
- **CI (fase 10):** la caché `node_modules/.astro` (~2 GB con 1000 productos) debe persistir entre builds. Sin ella, cada build tarda ~30 min.
- **`replace` deja objetos huérfanos** en el bucket. Falta un script de limpieza (objetos sin referencia en `image`) antes de producción.
- **Las fotos nuevas requieren rebuild** (webhook en la fase 13).
- Script de preparación de fotos reales (sRGB, sin EXIF/GPS, ~2400 px, JPEG q85–90): pendiente.
- Fotos mock (`apps/backend/.cache/mock-images`, 1,5 GB) y productos mock: solo dev. Borrar con `rm -rf apps/backend/.cache` cuando no hagan falta.
