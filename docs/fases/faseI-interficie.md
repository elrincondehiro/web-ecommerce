# Fase I-Interficie — UX/UI (cabecera, pie, home, ofertas)

> **Estado:** 🔍 implementada, **pendiente del visto bueno visual del usuario** (el agente no puede ver imágenes) y del PR.
> **Rama/PR:** `feat/i-interficie` (desde `main` = `82c7665`, I-Marca mergeada)
> **Anterior:** [I-Marca](./faseI-marca.md) · **Siguiente:** Fase 8 (Emails)

## 1. Objetivos

- [x] **Barra de anuncios** (marquee solo CSS, desde `.yaml`, accesible, sin botón de cerrar).
- [x] **Cabecera**: Tienda ▾ (categorías), Ofertas, Sobre nosotros; búsqueda, tema y carrito; se oculta al bajar y vuelve al subir; móvil rediseñado (142 → 102 px).
- [x] **Pie de 4 columnas** con logo: contacto, redes, información/legal, pagos.
- [x] **Home**: hero, categorías con imagen, carrusel de una Collection de Medusa, banner de ofertas y valores.
- [x] **`/ofertas/`** con Price Lists `sale` de Medusa, y **precio tachado + descuento en toda la tienda** (tarjetas, ficha, variantes) con el patrón build + `LiveSync`.
- [x] **`/sobre-nosotros/`** desde Markdown (borrador del agente, D6: **revisar el texto**).
- [ ] Visto bueno visual del usuario (claro/oscuro, móvil/escritorio).

## 2. Qué se ha hecho

### 2.1 Backend

- **`GET /store/ofertas?region_id=`** → `{ product_ids }` (`src/api/store/ofertas/route.ts`, lógica en `src/lib/ofertas.ts`): la Store API no filtra productos por Price List (D5 = A).
  - Pasos: Price Lists `sale` activas y dentro de fechas → sus precios → variantes (link `product_variant_price_set`) → productos publicados en los canales de la publishable key; se **confirma** con `calculated_price` (`QueryContext` con región y moneda): `price_list_type === "sale"` y precio calculado < original. Orden por título.
  - Validación zod (`validateAndTransformQuery` en `middlewares.ts`): 400 sin `region_id`, 404 con región desconocida.
  - Tests unitarios de `ofertas.ts` y de integración (`integration-tests/http/ofertas.spec.ts`, 4).
- **`pnpm backend:seed:mock:ofertas`** (`src/scripts/seed-mock-ofertas.ts`): idempotente y **convergente** (añade y quita) sobre el catálogo base `mock-*-001…024`:
  - Collection `destacados` con los 12 primeros por título (`createCollectionsWorkflow`, `batchLinkProductsToCollectionWorkflow`);
  - Price List "Ofertas de prueba" (`sale`, activa) con −20 % en 8 productos (precio redondeado hacia abajo a …,x5: 44,95 → 35,95), con `createPriceListsWorkflow` / `upsertPriceListPricesWorkflow`.

### 2.2 Storefront

- **Content Collections** (`src/content.config.ts`, loaders `file()`/`glob()`): `anuncios.yaml`, `home.yaml` (hero, destacados, ofertas, valores), `tienda.yaml` (email, teléfono, dirección, redes) y `paginas/*.md`. Lo **editorial** va aquí; lo **comercial** (ofertas, destacados) en Medusa.
- **Layout** (`src/components/layout/`): `AnnouncementBar`, `SiteHeader`, `SiteFooter`; `BaseLayout` solo los compone.
- **Barra de anuncios**: pista con dos copias (la 2.ª `aria-hidden` + `inert`) desplazada −50 % en bucle; duración por tramos de 10 s según la longitud del texto (clases, sin `style=` en línea por la CSP futura); se para con `:hover`/`:focus-within`; con `prefers-reduced-motion`, quieta y desplazable a mano. Altura fija (32 px).
- **Cabecera**: `popover` nativos sin JS (`popovertarget`: Escape, clic fuera y foco de vuelta los da el navegador).
  - Escritorio (≥ `lg`): «Tienda ▾» con las categorías, colocado bajo su botón con **anchor positioning** (`position-area`, `@supports`; sin soporte, panel fijo bajo la cabecera).
  - Móvil: ☰ · logo · tema · carrito; búsqueda a todo el ancho en la 2.ª fila; panel lateral con transición (`@starting-style`, `allow-discrete`).
  - **Se oculta al bajar** (D1): `SiteClient` pone `data-hide` (scroll pasivo + `requestAnimationFrame`, umbral 8 px); CSS con `translate` (sin CLS). No se oculta cerca del principio, con el foco dentro ni con un popover abierto. Sin JS: fija y siempre visible. Con movimiento reducido: sin transición.
  - Sin «Mi cuenta» (D7, fase 9).
- **Pie**: logo (`public/logo-pie.webp`, 240 px generado una vez con sharp; recuadro crema en oscuro), contacto (`mailto:`, `tel:`, dirección en `<address>`), redes (Instagram, WhatsApp `wa.me/34640260110`, YouTube), información y legal, y logos de Visa/Mastercard/AMEX (`public/pagos/`, ver §3). Sin «Transferencia» (D9).
- **Precio de oferta** (`components/Price.astro`, en `ProductCard` y `BuyBox`, también por variante):
  - `catalog.ts`: `wasAmount` = `original_amount_with_tax` solo si `price_list_type === "sale"` y es mayor que el actual; `discountPercent` redondeado hacia abajo; el producto anuncia la oferta de su variante más barata;
  - marcado: `[data-was-box]` (siempre presente, `hidden` si no hay oferta) con `<del data-was>` + «−20 %» `[data-off]`, y distintivo «Oferta» en la esquina de la tarjeta; el color del precio cambia con `:has()` (CSS), sin JS;
  - `LiveSync`: la tupla pasa a `[precio, rango, stock, anterior?, descuento?]` y el aplicador muestra/oculta el bloque. Una oferta que empieza o termina después del build se corrige en tarjetas y fichas.
- **`LiveSyncData`**: nuevos modos `collectionId` (carrusel) y `offersKey` (`/ofertas/`).
  - `/ofertas/` corrige **por los ids del build** (una oferta que termina también se corrige), pero la island recibe solo una **clave de 12 hex** (sha256 de los ids de la página, `lib/offer-pages.ts`). Los ids pasados como prop iban cifrados en la URL y en el JS inline: ~35 B gzip por producto (con 24, ~1950 B > 1434). astro-docs (server islands § Caching): pasar solo las props necesarias, sin arrays.
  - El reparto clave → ids lo escribe en el build `src/pages/ofertas/paginas.json.ts`; la integración `privateBuildManifests` (antes `privateCardImages`) lo mueve a `dist/server/offer-pages.json`, **no público**, junto a `card-images.json`. Lector común: `lib/build-manifest.ts`. En `astro dev` (sin manifiesto) se calcula al momento.
  - **Clave desconocida** (HTML de otro build, p. ej. cacheado en la CDN tras un despliegue) → `{}` → se queda lo del build (decisión del usuario). Nunca corrige tarjetas que no son de esa página.
  - `getSaleProductIds` memorizado: página, manifiesto y home ven la misma lista en todo el build.
- **Home** (`index.astro`): hero con `<Picture priority>` (AVIF/WebP, sin respaldo PNG; imagen **provisional**: el logo, `home.yaml`), categorías con la foto de su primer producto, carrusel scroll-snap de la Collection `destacados` (12, mismo ancho de tarjeta que la rejilla → mismas imágenes `card`; región con nombre y `tabindex=0` para teclado), banner de ofertas (solo si hay ofertas en el build) y valores.
- **`/ofertas/[...page]`**: estática, paginada (24), vacía con mensaje si no hay ofertas.
- **`/sobre-nosotros/`**: Markdown con CSS de prosa propio (`.prose-page`, sin plugin).
- **Fixtures** (`scripts/update-fixtures.mjs`): exactamente los 24 productos base por id, sin imágenes (la CI no tiene bucket), variantes en orden de `variant_rank`, `collection_id`, y nuevos `collections.json` y `offers.json`.
- **Iconos** Phosphor 2.1.1 nuevos: list, x, caret-down, envelope, phone, map-pin, instagram, whatsapp, youtube, heart, seal-check, paw-print, tag.

## 3. Decisiones tomadas

| Decisión                                                         | Motivo                                                                                                                     | Fuente                                                            |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| D1: cabecera que se oculta al bajar, con JS en `SiteClient`      | Elegido por el usuario (más espacio en móvil). +167 B gzip (1036 → 1203 B, límite 1536)                                    | MDN (scroll pasivo); CSS scroll-driven sin soporte completo       |
| D2: `popover` sin JS (Tienda ▾ y menú móvil)                     | Cierre con Escape/clic fuera y foco gestionados por el navegador; 0 JS                                                     | MDN Popover API, anchor positioning (invocador = ancla implícita) |
| D3: varios anuncios, sin cerrar                                  | Cerrar y recordarlo necesita JS y desplaza la página (CLS)                                                                 | Tailwind v4 / MDN `prefers-reduced-motion`                        |
| D4: carrusel = Collection `destacados`, 12, sin flechas          | Datos comerciales en Medusa; scroll-snap nativo                                                                            | context7 `/medusajs/medusa` (Collections)                         |
| D5 = A: ruta propia `/store/ofertas`                             | La Store API no filtra por Price List; precio desde `calculated_price` (`price_list_type: sale`)                           | context7 `/medusajs/medusa` (Price Lists, precios calculados)     |
| Precio tachado en toda la tienda                                 | Elegido por el usuario. Omnibus: el precio base no cambia y las ofertas son puntuales (rebajas, Black Friday)              | —                                                                 |
| D6: «Sobre nosotros» redactado por el agente                     | Borrador a partir del tono y valores del usuario: **revisar**                                                              | —                                                                 |
| D7: sin «Mi cuenta» hasta la fase 9                              | No hay cuentas todavía                                                                                                     | —                                                                 |
| D8: logos oficiales de pago desde `activemerchant/payment_icons` | SVG de las marcas, MIT (Shopify), v1.7.69, sin modificar. Para los ficheros «de marca» exactos, portales de Visa/MC/AMEX   | `public/pagos/LICENSE.md`                                         |
| D9: sin «Transferencia»                                          | El pago por transferencia aún no existe (tras la fase 8)                                                                   | —                                                                 |
| D10: `seed:mock:ofertas` con workflows                           | Idempotente y convergente; nada de SQL                                                                                     | AGENTS §4                                                         |
| Logo del pie como fichero de `public/`                           | El pie está también en páginas on-demand: sin sharp en runtime                                                             | fase7.md (D6)                                                     |
| Hero sin respaldo PNG (`fallbackFormat="webp"`)                  | El PNG llegaba a 192 KB; AVIF/WebP los soportan todos los navegadores objetivo                                             | astro-docs (`<Picture>`)                                          |
| `/ofertas/`: clave de página en la island, no ids                | JS inline fijo (~1,1 KB) sin importar cuántas ofertas; clave por contenido → seguro entre despliegues                      | astro-docs (server islands § Caching)                             |
| `/ofertas/` estática                                             | 0 KB de JS y caché; una oferta **nueva** necesita rebuild (webhook en la fase 13); las que terminan las corrige `LiveSync` | AGENTS §3.1                                                       |

## 4. Cómo usarlo

- **Anuncios**: editar `apps/storefront/src/content/anuncios.yaml` (≤ 90 caracteres; `activo: false` para ocultar; `enlace` opcional, ruta interna). Requiere rebuild.
- **Home**: `src/content/home.yaml`. Para cambiar la foto del hero, poner la imagen en `src/assets/` y cambiar `hero.imagen` (ruta relativa al `.yaml`) y `hero.imagenAlt`.
- **Destacados**: añadir/quitar productos de la Collection `destacados` en el Admin de Medusa (handle en `home.yaml`).
- **Ofertas**: crear una Price List de tipo **Sale** en el Admin (con fechas si se quiere); `/ofertas/` sale de las que estén vigentes al hacer el build.
- **Datos de la tienda** (pie): `src/content/tienda.yaml`. **Páginas** de contenido: `src/content/paginas/<id>.md` (hoy solo `sobre-nosotros`; una página nueva necesita su `.astro`).

## 5. Cómo testear esta fase

```bash
pnpm infra:up && pnpm dev:backend
pnpm backend:seed:mock:ofertas                  # Collection destacados + Price List de prueba
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
pnpm --filter backend test:integration:http      # incluye ofertas.spec.ts
pnpm --filter storefront build && pnpm --filter storefront check:budget
pnpm --filter storefront start                  # y en otra terminal:
pnpm --filter storefront test:e2e               # incluye e2e/interficie.spec.ts (con y sin JS)
node apps/storefront/scripts/update-fixtures.mjs   # solo si cambian los datos de prueba
```

Visual (a mano): home, `/ofertas/`, `/sobre-nosotros/`, ficha con y sin oferta, en claro y oscuro, móvil y escritorio. Abrir «Tienda ▾» y el menú ☰ (también con teclado: Tab, Enter, Escape). Bajar y subir en un listado (cabecera). Activar «reducir movimiento» en el sistema (barra quieta).

### 5.1 Medidas

| Métrica          | I-Marca | I-Interficie                                       |
| ---------------- | ------- | -------------------------------------------------- |
| `SiteClient`     | 1036 B  | 1203 B (≤ 1536)                                    |
| `CartClient`     | 992 B   | 992 B                                              |
| JS inline (máx.) | 1017 B  | 1138 B home · **1382 B `/ofertas/`** (≤ 1434)      |
| CSS              | 8211 B  | 9648 B                                             |
| HTML home        | 7899 B  | 15316 B (carrusel de 12 tarjetas, categorías, pie) |

Todo gzip. `/ofertas/` llegó a 1382 B con 8 ofertas cuando la island recibía los ids (crecía con cada oferta); con la clave de página es fijo (§2.2).

**Lighthouse 13.5.0** (`pnpm dlx`, móvil simulado, Chromium de Playwright, local sin compresión; rango de 1–3 pasadas):

| Página             | Perf  | A11y | Buenas prácticas | SEO | LCP       | CLS         |
| ------------------ | ----- | ---- | ---------------- | --- | --------- | ----------- |
| Home               | 95–97 | 100  | 100              | 100 | 2,3–2,7 s | 0–0,01      |
| `/productos/`      | 95    | 100  | 100              | 100 | 2,7 s     | 0,004       |
| Ficha (con oferta) | 97    | 100  | 100              | 100 | 2,4 s     | 0,001       |
| `/ofertas/`        | 95–96 | 100  | 100              | 100 | 2,6–2,7 s | 0,001       |
| `/sobre-nosotros/` | 98–99 | 100  | 100              | 100 | 1,7–2,2 s | 0,002–0,004 |

El LCP de la home pasa a ser la imagen del hero: con la primera versión (recuadro de 384 px en móvil) daba Perf 94 y LCP 2,8–2,9 s; se redujo a 240 px en móvil (imagen de 208 px). LCP > 1,8 s ya ocurría en `main` (fase 13).

## 6. Criterio de salida

- [x] Lint, formato, typecheck, tests (storefront 126; backend con `ofertas`), build sin avisos, `check:budget` y e2e (75 + 3 de Stripe omitidos sin `infra:stripe`) en verde.
- [x] 0 KB de JS propio nuevo en las páginas nuevas (`/ofertas/`, `/sobre-nosotros/` en la lista de `check:budget`).
- [x] Lighthouse ≥ 95 en Performance y 100 en accesibilidad y SEO en las páginas medidas.
- [ ] Visto bueno visual del usuario y revisión del texto de «Sobre nosotros» y de los anuncios.

## 7. Riesgos y pendientes

- **Omnibus** (precio anterior = el más bajo de los 30 días previos): Medusa no guarda historial; se cumple porque el precio base no cambia y las ofertas son puntuales (decisión del usuario). **Confirmar con la gestoría.**
- `/ofertas/` y el banner de la home se deciden **en el build**: una oferta nueva no aparece hasta el siguiente build (webhook de rebuild, fase 13).
- `min_price` del índice de búsqueda no tiene en cuenta las Price Lists: en `/buscar/`, el filtro y el orden por precio usan el precio base.
- El carrito no muestra el precio anterior (fuera de alcance).
- Hero con imagen **provisional** (el logo): falta foto.
- La barra de anuncios no tiene botón de pausa propio (WCAG 2.2.2 se cubre con hover/foco y `prefers-reduced-motion`). Valorar con el usuario.
- Anchor positioning: Firefox lo soporta desde la 147; en versiones anteriores, el desplegable «Tienda» sale en un panel fijo a la izquierda (usable).
