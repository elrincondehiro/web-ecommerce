# Fase S — Catálogo en el storefront (subcategorías, €/kg, analíticos, granel)

> **Estado:** ✅ cerrada (13-oct-2026) — S-1 (#45), S-2 (#46), S-3 (`feat/storefront-granel`), cierre `docs/cierre-fase-s`
> **Rama/PR:** `feat/storefront-subcategorias`, `feat/storefront-precio-unitario`, `feat/storefront-granel` (una por entrega)
> **Anterior:** [Fase C — Importador de catálogo](./faseC-catalogo.md) · **Siguiente:** fase 11 (producción, [ESTADO §6.5](../ESTADO.md))

Mostrar en el storefront lo que la [Fase C](./faseC-catalogo.md) ya carga en Medusa. Contrato de datos en [`apps/backend/catalog/plantilla/LEEME.md`](../../apps/backend/catalog/plantilla/LEEME.md) y [ESTADO §6.8](../ESTADO.md).

## 1. Objetivos

Propuesta de entregas (el orden y el corte se acuerdan con el usuario al planificar):

- [x] **S-1 Subcategorías + manifiesto de LiveSync**
  - [x] Páginas `/categorias/<handle>/` para **todas** las categorías con productos en su subárbol (las vacías no se generan).
  - [x] El listado de una categoría incluye los productos de sus **descendientes** (en build y en LiveSync), sin duplicados.
  - [x] Migas (y JSON-LD `BreadcrumbList`) con la cadena de padres; enlaces a las hijas en la página del padre.
  - [x] Navegación: cabecera con columnas por raíz + 2.º nivel (`popover`) y `<details>` por raíz en móvil; home con las raíces. 0 B de JS nuevo.
  - [x] Filtro de categoría de `/buscar/` por niveles sobre el campo nuevo `category_tree_handles` del índice.
  - [x] **D-S1**: LiveSync por **manifiesto de páginas** en categorías, `/productos/`, `/ofertas/` y carrusel de la home.
  - [x] `sitemap` con las nuevas páginas.
- [x] **S-2 Precio por kilo/litro y analíticos**
  - [x] €/kg con `variant.metadata.neto_g` o €/l con `neto_ml` en ficha y tarjeta (RD 3423/2000; siempre que haya contenido neto). Con LiveSync (AGENTS §3.2).
  - [x] Tabla de componentes analíticos en la ficha (`product.metadata`), tal cual y sobre materia seca.
  - [x] Filtros de **proteína y grasa sobre materia seca** (mínimo/máximo), calculados al indexar en `src/search/product.ts`.
  - [x] Interruptores en `src/lib/constants.ts` → `CATALOG_FEATURES` (€/kg en tarjetas, columna de materia seca, filtros).
- [x] **S-3 Granel**
  - [x] Ficha: campo de gramos (`<input type=number step=paso min=min_g>`, − / + de paso en paso, a mano cualquier múltiplo) y accesos rápidos 100 g / 250 g / 500 g / 1 kg. La action calcula `quantity = gramos / paso` con la regla de la **variante** (servidor). Sin JS, el `<form>` de siempre.
  - [x] Precio del mínimo («Desde 2,00 €») y «20,00 €/kg · mínimo 100 g» en tarjeta y ficha; «250 g · 20,00 €/kg» en el panel, `/carrito/`, checkout, pedido, «Mis pedidos» y emails (`packages/emails`).
  - [x] «Quedan 2,4 kg» en la ficha (con LiveSync); avisos de mínimo, de máximo (5 kg) y de paso, con toast y sin JS.
  - [x] Total en vivo junto al campo (CartClient), desactivable.
  - [x] Productos a granel de la plantilla y del mock en `publicado`.

## 2. Qué se ha hecho

### S-1 (rama `feat/storefront-subcategorias`)

**Datos de prueba nuevos.** Se ha reseteado la infra local (`down -v`, cachés de fotos y de `astro:assets`). Los `seed:mock*` se han archivado (`*.old`, nota en `apps/backend/src/scripts/OBSOLETOS.md`) y se sustituyen por:

- `catalog:mock [N=300]` → `catalog/mock/productos.csv`. Lo genera una función pura (`src/scripts/lib/catalog-mock.ts`, con test contra el lector real del importador) sobre el árbol real (`catalog/mock/categorias.csv`, copia de `mi-carga`, 37 categorías y 29 hojas). Reparte productos por las hojas con opciones con sentido, IVA según el tipo, ofertas (`precio_oferta`), `destacados`, agotados, `neto_g`/`neto_ml`, analíticos y granel en borrador. Es determinista.
- Se carga con `catalog:import catalog/mock`. `seed` crea la Collection `destacados`.

**Backend.** El índice `product` (`src/search/product.ts`) tiene un campo nuevo, `category_tree_handles` (la categoría y sus ancestros, a partir de `mpath`). `category_handles` no cambia. Como el campo es nuevo, cambia el `definition_hash` y `db:migrate` reconstruye el índice. Test de integración: filtrar por un padre incluye las hijas.

**Storefront.**

- `src/lib/categories.ts` (puro, con tests): árbol, subárbol, poda de vacías, categoría más concreta, filtro por niveles (`facetCategories`), «gana la más concreta» (`narrowCategories`) y nombres repetidos con su raíz («Juguetes (Gato)»).
- `src/lib/shop.ts`: árbol de la tienda (en build/dev se calcula; en runtime sale de `dist/server/shop-categories.json`) y manifiesto de listados.
- `lib/offer-pages.ts` pasa a `lib/listing-pages.ts`. Hay un solo endpoint prerenderizado, `listados/paginas.json`, que acaba en `dist/server/listing-pages.json` (68 páginas, unos 1100 ids con 300 productos). Otro, `listados/categorias.json`, acaba en `dist/server/shop-categories.json`. Ninguno es público.
- `LiveSyncData` solo acepta `productId | pageKey`. Se han retirado `categoryId`, `collectionId`, `offset`, `limit` y `getPricedProducts`.
- Páginas:
  - categoría con migas, JSON-LD, enlaces a las hijas y título «Juguetes · Gato» en subcategorías;
  - ficha con las migas de su categoría más concreta;
  - cabecera con columnas por raíz;
  - `/productos/` filtra por las raíces;
  - `/buscar/`: sin categoría elegida ofrece las raíces; con una elegida, ella y sus hijas.
- Las sugerencias siguen usando `category_handles` (la categoría directa: la más concreta).
- Fixtures de CI: `mock-*-001…048` publicados (47) con el árbol completo; `update-fixtures.mjs` ya no usa el regex `BASE`.

### S-2 (rama `feat/storefront-precio-unitario`)

**Backend.** El índice `product` tiene dos campos nuevos, `proteina_ms` y `grasa_ms` (`float`, filtrables, faceta `stats`, no recuperables). Se calculan al indexar con `dryMatter()` (`src/lib/dry-matter.ts`, con test unitario): `x / (100 − humedad) × 100`, con un decimal. Sin humedad válida, el producto no tiene el campo y no entra en el filtro. La fuente pide `metadata`. `db:migrate` reconstruye el índice (`product_v2`). Test de integración: rango sobre materia seca.

**Storefront.**

- `lib/catalog.ts`:
  - `unitPrice()` (€/kg o €/l a céntimos, desde `neto_g` / `neto_ml`); `getProductPricing` devuelve `unitPrice` por variante y la de la variante más barata;
  - `analyticRows()` y `dryMatter()`, el mismo cálculo que en el backend.
- `Price.astro`: prop `unit` → línea «10,65 €/kg» con `data-unit`.
  - Ficha: en cada fila de variante, o junto al precio si solo hay una.
  - Tarjeta: el de la variante del «Desde».
- LiveSync: sexto valor de la tupla (€/kg) y `["unit",5]` en el aplicador; el JS inline de la ficha pasa de 1120 B a 1127 B gzip.
- `AnalyticsTable.astro` (ficha, estático): «Tal cual» y «Materia seca», después los `analitico:X`.
- `/buscar/`:
  - parámetros `proteina_min|max` y `grasa_min|max` (0–100, un decimal, en la URL canónica);
  - filtros `$gte` / `$lte`, facetas `stats`, chips «Proteína s.m.: ≥ 40 %»;
  - panel con dos rangos (con `aria-label` propio: «Proteína mínima, % sobre materia seca»).
- En las categorías estáticas los rangos se calculan en el build, como el precio.
- `CARD_FIELDS` pasa a `*variants`: la Store API 2.21.2 descarta sin error `variants.metadata` suelto (no está en `allowedStoreProductExtraFields`). Mismo tiempo medido (~65 ms con 24 productos).
- Fixtures regenerados con la metadata. e2e:
  - ficha de pienso (€/kg y tabla);
  - tarjetas con €/kg y un producto sin contenido neto;
  - filtro de proteína sin JS.
- Lighthouse incluye la ficha de un pienso.

**Interruptores** (`src/lib/constants.ts`, `CATALOG_FEATURES`; cambiar = rebuild):

- `unitPriceInCards`: €/kg en las tarjetas (la ficha lo muestra siempre);
- `dryMatterColumn`: columna «Materia seca» de la tabla;
- `dryMatterFilters`: filtros de materia seca en `/buscar/` y «Filtrar». Con `false`, los parámetros de la URL se ignoran: canónica sin ellos, 301.

### S-3 (rama `feat/storefront-granel`)

**Modelo** (sin cambios en Medusa, Fase C): una variante a granel vende **pasos** de `paso_g` gramos. El precio es el de un paso (0,10 € con 20 €/kg y pasos de 5 g) y el inventario va en gramos (`required_quantity` = paso). Así `inventory_quantity` sale en pasos. El hook `granel-minimo` rechaza (400) un carrito por debajo de `min_g`. El storefront habla en **gramos**: gramos = cantidad × paso.

**Storefront.**

- `src/lib/bulk.ts` (puro, con tests):
  - `bulkRule`, `checkGrams` (paso, mínimo y máximo contando lo que ya hay en el carrito → `invalid` / `minimum` / `maximum`);
  - `commonRule` (varias variantes con un solo campo: mcm de pasos, mayor mínimo);
  - `quickGrams`, `formatGrams` («1,25 kg»), `formatStockGrams` («Quedan 2,4 kg», desde 1 kg redondeado hacia abajo a 100 g);
  - `lineRule`, `lineGrams` y `lineQuantityLabel` para las líneas de carrito y pedido.
- `getProductPricing`: en granel, `amount` = precio del **mínimo**, `unitPrice` = €/kg, `wasAmount` = el anterior del mínimo, `inStock` = caben los pasos del mínimo, y `bulk` con paso, mínimo, precio del paso y stock en gramos. El «Desde» siempre se ve (`hasPriceRange`). `minimumNote()` → «mínimo 100 g».
- Tarjeta: «Desde 2,00 €» y «20,00 €/kg · mínimo 100 g» (el €/kg se ve aunque `unitPriceInCards` sea `false`). El botón es «Elegir cantidad» y va a la ficha: no se añade desde el listado.
- Ficha (`BuyBox` + `AddToCart` con `bulk`):
  - campo «Cantidad (g)» (`name="grams"`) y «De 5 g en 5 g · mínimo 100 g · máximo 5 kg»;
  - accesos rápidos: botones `type=submit name=preset` con `formnovalidate`, que añaden directamente (igual con y sin JS);
  - «Quedan 2,4 kg» con `data-left` (LiveSync, séptimo valor de la tupla y `["left",6]` en el aplicador).
- Actions (`src/actions/index.ts`):
  - `cart.add` acepta `grams` / `preset`: lee la metadata de la variante (`GET /store/product-variants/:id`, `getVariantMetadata`) y cuenta lo que ya hay en el carrito;
  - `cart.update` acepta `grams` (0 = quitar) con la regla de la variante de la línea;
  - el error de mínimo del backend se clasifica como `minimum`.
- Avisos nuevos `minimum` y `maximum` (CSS `:target` sin JS; toast con JS).
- Carrito, panel, checkout, `/pedido/`, «Mis pedidos»:
  - líneas «250 g · 20,00 €/kg» (precio y tachado por kilo) y edición en gramos en `/carrito/`;
  - una línea a granel cuenta **1** artículo (`itemCount`).
  - Los campos de carrito y pedido piden `*items.variant`: la Store API 2.21.2 descarta `items.variant.metadata` suelto; de unos 15 a unos 18 ms.
- `CartClient` (total en vivo, `bulkLiveTotal`): «Total: 5,00 €» = gramos × el €/kg de `[data-unit]` de la página (corregido por LiveSync). Además envía el botón pulsado (`new FormData(form, submitter)`) para los accesos rápidos. Pasa de 1030 a **1310 B gzip** (límite: 2048 B).
- `QuantityField`: props `name`, `step` y `unit` («5 g más de …»). Los de gramos no llevan `data-qty`, así que en táctil sí se abre el teclado.
- JS inline de la ficha a granel: 1130 B gzip.

**Backend.**

- Índice `product`: en granel, `min_price_eur` / `max_price_eur` = precio del mínimo (`bulkMinimumAmount`, `src/lib/granel.ts`). Así el filtro y el orden por precio no ven 0,10 €. Como solo cambia el `transform`, el `definition_hash` es el mismo y no hace falta `db:migrate`: los productos se reindexan con `product.updated` / `product-variant.updated` (al importar).
- Emails: `toEmailItem` lee `items.variant.metadata` → `bulk: { grams, pricePerKg }`. `LineItems` (`packages/emails`) pinta «250 g · 20,00 €/kg» y, en el de envío, solo los gramos. `PreviewProps` del pedido con una línea a granel.
- `catalog:mock` publica el granel; la plantilla publica `alas-pollo-deshidratadas`; `LEEME.md` explica cómo se ve en la tienda.
- `stock:mock` repone el granel en tramos de 250 g (10 → 2,5 kg libres, 50 → 12,5 kg).

**Pruebas:**

- unitarias: storefront 193, backend 64, emails 15;
- integración: 23 (con `min_price_eur` del mínimo);
- e2e: 118 (6 skipped preexistentes), dos pasadas seguidas:
  - sin JS: gramos, acceso rápido, edición en el carrito, mínimo / paso / máximo y la tarjeta;
  - con JS: − / +, total en vivo, acceso rápido;
  - checkout: pedido con Stripe test, página del pedido y email en Mailpit, todo en gramos.
- Lighthouse incluye la ficha a granel (100/100/100/100).

**Interruptores** (`CATALOG_FEATURES`; cambiar = rebuild):

- `bulkLiveTotal`: total en vivo;
- `bulkStockLeft`: «Quedan 2,4 kg» (con `false` no se pinta ni viaja en LiveSync);
- `bulkMaxG`: máximo por línea (5000 g).

## 3. Decisiones tomadas

| Decisión                                                                                         | Motivo                                                                                                                                                                                                                                                                  | Fuente consultada                                                                                                                             |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Campo nuevo `category_tree_handles` (no cambiar `category_handles`)                              | El `definition_hash` del Search Module solo depende de `fields`/`settings`/…: un campo nuevo fuerza la reconstrucción con `db:migrate` (sin `--execute-all-search`). Las sugerencias necesitan la categoría directa                                                     | `@medusajs/medusa` 2.21.2 instalado (search loader); context7 `/medusajs/medusa`                                                              |
| Categorías vacías (sin productos en su subárbol): sin página, ni menú, ni home, ni sitemap       | Decisión del usuario; `/store/products?category_id` no incluye descendientes en 2.21.2 → se calcula en el storefront                                                                                                                                                    | `api/store/products/middlewares.js` 2.21.2                                                                                                    |
| Filtro «Categoría» por niveles; elegir hija + padre → filtra la hija                             | Con 37 categorías la lista plana sería inmanejable; dentro del grupo los valores van con OR y el padre ya incluye a la hija                                                                                                                                             | —                                                                                                                                             |
| Árbol de la tienda en `dist/server/shop-categories.json`                                         | Las páginas on-demand (carrito, `/buscar/`) muestran el mismo menú que las estáticas sin consultar a Medusa en cada petición                                                                                                                                            | astro-docs (endpoints estáticos)                                                                                                              |
| €/kg en ficha y tarjeta, siempre que haya contenido neto                                         | Decisión del usuario (S-2): RD 3423/2000 pide el precio unitario donde se anuncia el precio; sin aplicar las exenciones (≤ 50 g…). Desactivable en tarjetas                                                                                                             | —                                                                                                                                             |
| Materia seca calculada al indexar (no guardada en Medusa)                                        | El dato de la hoja es el de la etiqueta; el cálculo es fijo y barato. Filtros solo de proteína y grasa (decisión del usuario)                                                                                                                                           | context7 `/medusajs/medusa` (`search.float`, facetas `stats`, `$gte`/`$lte`); meilisearch-docs (comparaciones, `facetStats`)                  |
| `CARD_FIELDS` con `*variants`                                                                    | `variants.metadata` no está entre los campos permitidos de la Store API 2.21.2 (`api/store/products/query-config.js`) y se descarta sin error                                                                                                                           | código instalado de `@medusajs/medusa` 2.21.2                                                                                                 |
| Granel: precio anunciado = el del mínimo («Desde 2,00 €») + «20,00 €/kg · mínimo 100 g»          | Decisión del usuario (S-3). Es lo mínimo que se paga; el €/kg cumple el RD 3423/2000. El índice usa el mismo precio para filtrar y ordenar                                                                                                                              | —                                                                                                                                             |
| La regla de granel sale de la metadata de la **variante**, nunca del formulario ni de la línea   | `paso_g` no se puede cambiar una vez creada la variante; la metadata de la línea la puede escribir cualquiera por la Store API y un `paso_g` falso haría que el pedido dijera «1 kg» por un paso                                                                        | context7 `/medusajs/medusa` (metadata de line items); `api/store/carts/validators.js` 2.21.2                                                  |
| `*items.variant` en carrito y pedido; `GET /store/product-variants/:id` para validar             | `items.variant.metadata` no está entre los campos permitidos (`api/store/carts/query-config.js`) y se descarta sin error; `*items.variant` sí trae `metadata` (+~3 ms)                                                                                                  | código instalado de `@medusajs/medusa` 2.21.2                                                                                                 |
| − / + de paso en paso; a mano, cualquier múltiplo; accesos 100 / 250 / 500 g / 1 kg; máximo 5 kg | Decisión del usuario. Los accesos son botones de envío (`name=preset`): funcionan sin JS                                                                                                                                                                                | astro-docs (Actions con `accept: "form"`; `z.number()` en inputs `number`)                                                                    |
| «Quedan 2,4 kg» y total en vivo, desactivables                                                   | Decisión del usuario: el «Quedan» puede invitar a reservas falsas; el total es JS (+280 B en CartClient)                                                                                                                                                                | —                                                                                                                                             |
| Una línea a granel cuenta 1 en el contador                                                       | 250 g = 50 pasos: el contador diría 50                                                                                                                                                                                                                                  | —                                                                                                                                             |
| **D-S1**: manifiesto de páginas para LiveSync en todos los listados; descartada la ventana ancha | Análisis en [ESTADO §6.8](../ESTADO.md): correcto aunque Medusa cambie sin rebuild, 0 B de JS de cliente, ~140 KB por 1000 productos en `dist/server`; la island deja de repetir la consulta del build (imprescindible con subcategorías y con el orden de ESTADO §6.7) | `LiveSyncData.astro`, `live-sync.ts`, `listing-pages.ts`, `build-manifest.ts`; astro-docs (props de server islands > 2048 B → POST sin caché) |

## 4. Cómo usarlo

- **Categorías**: se crean con el importador (Fase C, `padre` = handle del padre). Las vacías no salen. Un cambio en el árbol o en los productos necesita **rebuild** del storefront: hasta entonces, los listados solo corrigen precio y stock (LiveSync).
- **€/kg / €/l**: `neto_g` o `neto_ml` en la variante (columna de la hoja).
- **Analíticos**: columnas `proteina_pct`… y `analitico:<Nombre>`. Con `humedad_pct`, se ve la columna de materia seca y el producto entra en los filtros.
- **Granel**: `granel = sí`, más `paso_g`, `min_g`, `precio_kg` (y `precio_oferta_kg`) y `stock_g`. El importador lo convierte a precio por paso, con inventario en gramos. Contrato completo en `apps/backend/catalog/plantilla/LEEME.md`.
- **Interruptores** en `apps/storefront/src/lib/constants.ts` (`CATALOG_FEATURES`; cambiar = rebuild):
  - `unitPriceInCards`, `dryMatterColumn`, `dryMatterFilters` (S-2);
  - `bulkLiveTotal`, `bulkStockLeft`, `bulkMaxG` (S-3).
- **Producción**: si ya hubiera productos a granel indexados antes de S-3, hay que reindexarlos para que el precio del índice sea el del mínimo. Basta con reimportarlos o con `POST /admin/search-indexes/:id/reindex`. El `definition_hash` no cambia, así que `db:migrate` no lo hace.

## 5. Cómo testear esta fase

```bash
pnpm infra:up
pnpm --filter backend exec medusa db:migrate          # índice product_v2
pnpm --filter backend catalog:mock                    # catalog/mock/productos.csv (300 productos)
pnpm --filter backend catalog:import catalog/mock
pnpm --filter backend stock:mock                      # repone stock (granel en tramos de 250 g)

pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
pnpm --filter backend test:integration:http
STOREFRONT_DATA=fixtures pnpm --filter storefront build && pnpm --filter storefront check:budget

# e2e (backend en marcha + build real + Stripe CLI para el checkout):
pnpm --filter backend dev &                           # pararlo por PID al acabar
pnpm infra:stripe
pnpm --filter storefront build && pnpm --filter storefront test:e2e
```

Páginas de referencia (mock):

- `/categorias/alimentacion-perro/` (padre) y `/categorias/pienso-perro/` (hija);
- `/producto/mock-pienso-premium-001/`: €/kg y analíticos;
- `/producto/mock-premios-plus-010/`: granel;
- `/buscar/?proteina_min=30`.

Fixtures de CI: `set -a; . ./.env; set +a; node scripts/update-fixtures.mjs` en `apps/storefront`, con el mock cargado.

## 6. Criterio de salida

- [x] Presupuestos de AGENTS §3.4 sin excepciones nuevas. `CartClient`, de 1030 a 1310 B (≤ 2 KB), anotado allí.
- [x] Lighthouse móvil ≥ 95 / 95 / 100 en categorías (padre e hija) y ficha: 7 URL en `lighthouserc.cjs`, con un pienso y la ficha a granel.
- [x] e2e con JS desactivado para el granel (añadir al carrito con gramos).
- [x] README §4 sincronizado (la fase no cambia dependencias); ESTADO.md y README §13 actualizados.

## 7. Pendientes / riesgos

- Admin de Medusa: la cantidad de una línea a granel se ve en **pasos** (50 = 250 g). Pendiente: una extensión de Admin o un aviso en la plantilla del albarán.
- El máximo de 5 kg solo lo aplica el storefront. Por la Store API directa se podría pedir más: el stock sigue protegido.
- Si una categoría **cambia de padre**, el Search Module solo reindexa sus productos directos: los de sus subcategorías conservan los ancestros viejos en `category_tree_handles` hasta que se reimporten (o se reconstruya el índice).
- `/store/products` no ordena las variantes por `variant_rank` (todas a 0): en el panel «Talla» sale S, L, M. Queda como issue.
- Granel: si se cambia `min_g` de una variante, las líneas ya en carritos siguen valiendo; el hook del backend lo comprueba al tocar la línea. Ofertas de granel: el tachado del carrito es por kilo (`compare_at_unit_price` × 1000 / paso).
- `stock:mock` repone el granel en tramos de 250 g: si los e2e de checkout llegan a gastarlo, `pnpm --filter backend stock:mock`.
- Tamaño del build: más páginas de categoría (37 en la hoja real) × paginación; vigilar tiempo de build y `dist/`.
- El handle de las subcategorías debe ser único (ya lo exige el importador: sufijos `-perro`/`-gato`).
- Antiparasitarios: posible medicamento veterinario regulado (RD 666/2023), revisar con la gestoría antes de publicarlos.
