# Fase 13 — Optimización: datos estructurados, imagen del backend, sin Svelte y view transitions

> **Estado:** ✅ (15-nov-2026)
> **Rama/PR:** `docs/pendientes-v030` (a petición del usuario, en la misma PR)
> **Anterior:** [Fase 13 — rebuild del storefront](./fase13-rebuild.md)

## 1. Qué se ha hecho

| Tarea                      | Resultado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`offers` en el JSON-LD** | La ficha publica el precio para Google (`lib/seo.ts`, `productJsonLd`): una variante → `Product` + `Offer`; varias → `ProductGroup` con un `Product` y su `Offer` por variante (`hasVariant`, `variesBy` talla/color/estampado). `Offer`: `price` > 0, `priceCurrency`, `availability`, `itemCondition`, `url`, `sku`; en oferta, el anterior como `StrikethroughPrice`; con contenido neto, el €/kg o €/l como `UnitPriceSpecification.referenceQuantity`. Marca: `metadata.marca` (o la tienda). Sin precio: descatalogados, configurables (correa, caja) y sin precio. |
| **Imagen del backend**     | **1,08 GB → 732 MB** (−350 MB): el Dockerfile borra del `node_modules` de producción los source maps, los `.d.ts` y los README/CHANGELOG (no se ejecutan; los LICENSE se conservan). Probada: server y worker arrancan, `/health`, el Admin se sirve, Store API y búsqueda, sin errores.                                                                                                                                                                                                                                                                                  |
| **Sin Svelte**             | `@astrojs/svelte`, `svelte`, `svelte-check`, `bits-ui`, `eslint-plugin-svelte` y `prettier-plugin-svelte` fuera. Svelte solo pintaba `Badge` y `Button` (estáticos): `Badge.astro` y las clases (`buttonVariants`, `badgeVariants`) en `.ts`. **Las 1210 páginas del build salen idénticas** (comparadas, salvo los comentarios de hidratación de Svelte). También fuera: el MCP `svelte`, la skill `shadcn-svelte` y `components.json`.                                                                                                                                  |
| **View transitions**       | `@view-transition { navigation: auto }` en `global.css`: fundido de 150 ms al navegar (Chromium, Safari 18.2+; Firefox navega como siempre), sin animación con `prefers-reduced-motion`. 0 JS.                                                                                                                                                                                                                                                                                                                                                                            |
| **`stock:mock`**           | Ya repone los 1000 mocks (la consulta devuelve todos desde Medusa 2.22; el «solo 100» era de 2.21). Comprobado con un mock del final (`MOCK-989-1`).                                                                                                                                                                                                                                                                                                                                                                                                                      |

## 2. Decisiones

| Decisión                                                      | Motivo                                                                                                                                                                                                                                                                             | Fuente                                                                               |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `ProductGroup` + `hasVariant`, no `AggregateOffer`            | Google: «Don't use AggregateOffer to describe a set of product variants»; merchant listings exigen `Offer`                                                                                                                                                                         | context7 Google Search Central (product-snippet, merchant-listing, product-variants) |
| Precio y stock del build en el JSON-LD                        | El rebuild (fase 13) regenera la ficha a los minutos de un cambio de catálogo. El stock que baja al vender NO dispara rebuild: puede ir por detrás. Para Google Shopping, la fuente será el feed de Merchant Center                                                                | fase3 §7 (motivo de no tenerlo antes)                                                |
| Sin `shippingDetails` ni `hasMerchantReturnPolicy`            | Recomendados, no obligatorios; dependen de las condiciones de envío y devolución definitivas (gestoría)                                                                                                                                                                            | merchant-listing                                                                     |
| Borrar maps/tipos/docs, no las herramientas del Admin (Vite…) | El Admin en producción solo se SIRVE (`admin-bundler` `serve`: express + compresión), pero `@medusajs/admin-bundler` las importa en `develop`/`build`: quitarlas a mano es frágil. Ganancia segura sin riesgo                                                                      | código de `@medusajs/medusa` 2.22.6 (`loaders/admin.js`) y `admin-bundler` (`serve`) |
| Quitar Svelte                                                 | Aprobado por el usuario: no había islas; solo HTML estático de dos componentes                                                                                                                                                                                                     | analisis-js §5 P2                                                                    |
| Solo el fundido, sin la foto compartida tarjeta → ficha       | La foto compartida necesita un `view-transition-name` único por producto (CSS por tarjeta en el `<head>`, CSP sin `style=""`) para un efecto pequeño. Medido el fundido: navegación +50 ms (lo que dura, solapado con la carga), CLS 0, Lighthouse igual (home 90–91, ficha 92–96) | MDN (@view-transition), fase3 §7.1                                                   |

## 3. Cómo testear

```bash
pnpm --filter storefront exec vitest run src/lib/seo.test.ts          # offers, ProductGroup, oferta, €/kg
pnpm --filter storefront exec playwright test datos-estructurados     # JSON-LD de una ficha real y de la caja
docker build -f apps/backend/Dockerfile -t ecommerce-backend:local . && docker images ecommerce-backend:local
# Validar el JSON-LD en Google: https://search.google.com/test/rich-results (con la URL de una ficha)
```

## 4. Pendiente

- `shippingDetails` y `hasMerchantReturnPolicy` en el JSON-LD (o a nivel de organización) cuando estén las condiciones definitivas.
- Google Shopping: feed de Merchant Center (aparcado, PENDIENTES §3).
- El Admin podría salir del `node_modules` de producción si Medusa lo separa en el futuro (~150 MB más).

## 5. Fotos del catálogo y muestras de color (A, 16-nov-2026)

- **`tools/fotos`** (paquete interno nuevo, workspace `tools/*`): `pnpm --filter tools-fotos preparar <origen> <destino>`
  → sRGB, giradas según el EXIF, sin metadatos (ni EXIF ni GPS), 2000 px y JPEG 88 (mozjpeg); muestras 400 px en PNG.
  Avisos (no cuadrada, pequeña, muestra sin transparencia), nombres fuera de la convención y colisiones. `sharp` 0.35.5
  (decisión del usuario: herramientas internas sí, siempre que no afecten al backend ni al storefront). Probada con
  fotos con EXIF/GPS y orientación 6, CMYK y PNG transparentes.
- **Muestras de color propias del valor**: `handle--valor_muestra.png|webp` → `images:import` la sube a `muestras/` y la
  guarda en la metadata del **valor** de la opción `opcion_fotos` (`muestra`, y `muestra_fuente` = fichero:bytes para
  no repetir). **Una por valor, compartida** entre productos (decisión del usuario). No va a la galería. El selector
  (`VariantPicker`) la enseña sin marco ni fondo (`<Image>` WebP `fit: contain`, conserva la transparencia); si no
  hay, la foto de la variante o el color, como antes. Ejemplo en `plantilla/selector-fotos/fotos/` y prueba en
  `mock/arneses` (`prueba-arnes-marca`). Tests: `image-files.unit.spec.ts`, `variant-picker.test.ts`, e2e `variantes`.
- **JSON-LD** (tras la prueba de Google en el VPS): cada variante lleva `image` (crítico en «Fichas de comerciante») y
  `description`. `review`/`aggregateRating` (avisos del producto) no aplican: la tienda no tiene reseñas.
- **CI `integration` en Gitea (exit 137)**: no fallaba ningún test, el kernel mataba Jest por memoria. Con
  `--runInBand`, cada fichero arranca un Medusa y el heap crecía hasta ~3 GB (el LXC del runner tiene 4 GB). Ahora va
  `--maxWorkers=1` + `workerIdleMemoryLimit: "1GB"` (`jest.config.js`; context7 `/jestjs/jest`): el worker se recicla
  y el pico queda en ~1,3 GB, con el mismo tiempo (~10 min). Límite del job: 40 min.

## 6. Variantes ordenadas (23-nov-2026)

- **Problema**: todas las variantes tenían `variant_rank = 0` y la Store API las devuelve en orden de creación: la
  tabla de tallas de una ficha salía «S, L, M»; los filtros de peso, «3 kg, 12 kg, 400 g, 800 g».
- **Storefront**: `sortedVariants` (lib/catalog.ts, en `getProductPricing`: tabla, preselección, carrito, JSON-LD…) por
  `variant_rank` y, con el mismo rango, el **orden natural** de sus valores opción a opción (`lib/value-order.ts`:
  tallas XXS→XXXL, cantidades con unidad por su magnitud —g/kg, ml/l, mm/cm/m—, el resto alfabético con números). El
  mismo `compareValues` ordena el selector y los filtros. 0 JS. Comparado el HTML con `main`: cambian 219 páginas y solo
  en el orden (87 solo reordenan filtros, 97 el JSON-LD de las variantes, 35 fichas con su tabla; p. ej.
  `mock-cama-esencial-147` S, L, M → S, M, L), con la misma variante preseleccionada.
- **`catalog:import`**: la hoja manda (decisión del usuario): `variant_rank` = posición de la fila dentro del producto,
  al crear y al actualizar (cambio «orden» en el informe). Test unitario y HTTP (`catalogo.spec.ts`).
- **Admin**: widget «Orden de las variantes en la tienda» (`product-variant-order.tsx`, `product.details.after`) con
  ↑/↓, «Orden natural» y «Guardar orden» → `POST /admin/products/:id/variants/batch` (ruta estándar, `variant_rank`).
  El Admin 2.22.7 solo deja ordenar al crear el producto, y su ficha se carga sin variantes (`PRODUCT_DETAIL_FIELDS
= "…,-variants"`): el widget las pide aparte. Sin dependencias (sin arrastrar). Probado en el Admin con Playwright.
  `lib/value-order.ts` idéntico en backend y storefront (test).
- La tienda lo enseña tras la siguiente publicación (el cambio de variante dispara el rebuild).

## 7. `stock:import`: stock en masa (23-nov-2026)

- `pnpm --filter backend stock:import <hoja.csv> [fijar] [dry-run]` (`src/scripts/stock-import.ts`; hoja y plan puros en
  `lib/stock-import.ts`). Plantilla y LEEME: `catalog/plantilla/stock/`.
- **Columnas**: `sku`, `ean` o `handle` (uno por fila; el handle solo con productos de una variante; si hay varios,
  manda el SKU y se avisa) + `stock` (entero; granel en gramos) + `modo` opcional **por fila** (`sumar`/`fijar`; vacío =
  el de la orden). **Por defecto `sumar`** (reponer), `fijar` como opción (decisiones del usuario, modo híbrido).
- Respeta lo reservado (avisa al fijar por debajo); la misma variante dos veces se aplica en orden; productos sin control
  de stock → error; con cualquier error no escribe nada. `updateInventoryLevelsWorkflow` (como `stock:mock`) y
  `clearMedusaCache`; la búsqueda se pone al día con `search-stock-sync` (≤ 5 min).
- Tests: unit (`stock-import.unit.spec.ts`, la plantilla en `catalog-templates`) y HTTP (`stock-import.spec.ts`: la
  hoja de ejemplo, `fijar`, `dry-run`, errores, reservas y granel). Probado en dev con `dry-run` (informe
  `antes → después` y errores por línea).
