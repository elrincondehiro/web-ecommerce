# Fase 7 — Búsqueda y filtros

> **Estado:** ✅ 7-1 completada · ✅ 7-2 completada (05-oct-2026; push/PR pendientes: Gitea no accesible)
> **Rama/PR:** `docs/fase7-plan` (este plan) · implementación: `feat/fase7-1-busqueda`, `feat/fase7-2-sugerencias` (sobre la de 7-1)
> **Anterior:** [Fase 5](./fase5.md) · **Siguiente:** por decidir (propuesta: Marca → 8 Emails)

La fase se divide en dos subfases **independientes**. 7-2 solo añade JS encima de lo que entrega 7-1, que funciona completa sin JS.

| Subfase | Contenido                                                                                                                                                                     | JS en cliente                                                           |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **7-1** | Índice de productos, `/buscar/` on-demand con búsqueda tolerante a erratas, filtros, orden y paginación (modo A), barra de búsqueda en la cabecera, experimento de navegación | 0 KB sin JS; con JS, `SearchLive` (811 B gzip, solo en `/buscar/`, D10) |
| **7-2** | Sugerencias mientras se escribe en la barra de la cabecera (productos y categorías)                                                                                           | `SiteClient` (862 B gzip, en todas las páginas, §2.7)                   |

## 0. Hallazgo que cambia el planteamiento (leer primero)

Al consultar la documentación de la versión instalada, **Medusa 2.21.1 incluye un _Search Module_ propio** (`@medusajs/medusa/search`, `@since 2.21.1`). En 2.21.2 está registrado por defecto con el proveedor **PostgreSQL** y sus tablas ya existen en la BD local: `search_index*` y las extensiones `pg_trgm` y `unaccent`.

- Las **definiciones de índice** son agnósticas del motor: `src/search/product.ts` con `defineSearchIndex`, `graphSeed` y `graphConsume`. El módulo crea el índice físico, lo llena, aplica los eventos, versiona el índice y lo reconstruye **sin cortes** si cambia la definición (`db:migrate` / `db:migrate:search`).
- Hay una **ruta de tienda nativa**, `POST /store/search`, que se habilita con el middleware `configureStoreSearch`. Por defecto filtra a productos `published` del canal de venta de la publishable key. El motor se elige con un **proveedor** y se puede cambiar sin tocar el storefront.
- La guía antigua de Medusa para integrar Meilisearch (módulo propio + subscribers + InstantSearch en cliente) está marcada como **obsoleta desde 2.21.1** (`llms-full.txt`, "Integrate Meilisearch with Medusa").
- **Medusa no mantiene un proveedor para Meilisearch**: o lo escribimos nosotros (interfaz `ISearchProvider`: `upsertIndex`, `deleteIndex`, `listIndexes`, `upsertDocuments`, `deleteDocuments`, `clearIndex`, `search`, `searchMany?`, `waitForTask?`) o usamos el de la comunidad.

Fuentes:

- `llms-full.txt` (secciones Search Module, Search Module Providers, PostgreSQL Search Module Provider y Reindexing and Migrations).
- Páginas `.md` de docs.medusajs.com: `resources/infrastructure-modules/search`, `…/search/index-definitions`, `…/search/product-index-examples`, `cloud/search/postgres`, `cloud/search/meilisearch`, `cloud/search/comparison` y `resources/references/search/provider`.
- Código instalado: `node_modules/@medusajs/{search,search-postgres,types/dist/search}` y `medusa/dist/api/store/search`.
- context7 `/medusajs/medusa`.

### D1 — Motor de búsqueda (decisión del usuario, **bloqueante**)

| Opción                                                                                                          | Qué supone                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Dependencias nuevas                                                                |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **A. Search Module + proveedor Meilisearch de la comunidad** (`@rokmohar/medusa-plugin-meilisearch@2.3.1`, MIT) | Usa Meilisearch como estaba previsto. El plugin implementa el proveedor completo, una página de admin para reindexar y rutas `GET /store/meilisearch/products` con precio/stock nativos. ~31 000 descargas/semana; un solo mantenedor; 65 ★; publicado el 03-oct-2026. Peers: `@medusajs/* ~2.21.1`, react 18.3.1, `@tanstack/react-query` 5.64.2 (los mismos que ya usa el dashboard). Su README avisa: _"Each Medusa minor has so far reshaped the Search Module"_, así que **cada minor de Medusa tendría que esperar a que el plugin la soporte**.                                               | `@rokmohar/medusa-plugin-meilisearch` (arrastra `meilisearch` ^0.62.0)             |
| **B. Search Module + proveedor Meilisearch propio**                                                             | Control total, pero hay que mantener ~9 métodos: traducir el árbol de filtros (`$and/$or/$not/$in/…`), facetas, orden, paginación y ajustes del índice a la sintaxis de Meili. Por la experiencia del plugin, ese código cambia con cada minor de Medusa. Coste estimado: varios días más, más mantenimiento.                                                                                                                                                                                                                                                                                        | `meilisearch@0.62.0` (backend)                                                     |
| **C. Search Module + proveedor PostgreSQL (oficial, ya instalado)**                                             | Sin infraestructura nueva y avanza junto con Medusa. Erratas con trigramas (`pg_trgm`), sin acentos (`unaccent`), facetas de valor, rango y estadísticas, orden y filtros con todos los operadores. Limitaciones documentadas: los pesos se agrupan en 4 niveles, no hay resaltado, no hay sinónimos y la búsqueda compite por la BD con el checkout. Para español hay que crear la configuración `medusa_search_spanish` con un _migration script_ (ejemplo en la doc). Si más adelante falta calidad, **se cambia a A o B sin tocar el storefront** (solo cambian el proveedor y la reindexación). | ninguna; además sobraría el contenedor de Meilisearch (~112 MiB medidos en reposo) |

**Recomendación**: hacer primero el **spike del §2.0** (medio día, con permiso para escribir en la infraestructura de dev) comparando **C** y **A** sobre los 1000 productos mock: latencia, erratas (`bufnda`), español (plurales y acentos) y facetas. Con los datos en la mano, el usuario elige.

- Si el resultado es parecido, C es lo más sencillo y lo más rápido de mantener.
- Si Meilisearch gana claramente en relevancia, A.
- B solo si A resulta inestable.

En los tres casos el storefront es **idéntico**: habla con `POST /store/search` del backend usando la publishable key. **Ninguna clave de Meilisearch llega al storefront**, ni siquiera al servidor de Astro.

> Consecuencia documental (hecho): AGENTS §2/§4 y README §1/§14 ya dicen que el storefront busca vía `POST /store/search` y que ninguna clave de Meilisearch sale del backend.

## 1. Objetivos

### 7-1 (0 JS) ✅

- [x] Índice `product` (`src/search/product.ts`), con eventos para mantenerlo al día (stock por lotes, D8). Reindexación desde el Admin: no (solo el proveedor del plugin, sin su página de Admin).
- [x] `POST /store/search` habilitado solo para el índice `product` (`configureStoreSearch`).
- [x] Barra de búsqueda en la cabecera: `<form method="get" action="/buscar/">` con `<input type="search" name="q">`, en todas las páginas. 0 JS.
- [x] `/buscar/` on-demand con:
  - búsqueda **tolerante a erratas** (la del motor);
  - filtros por **categoría**, **etiquetas**, **opciones** (talla, color…), **rango de precio** y **disponibilidad**;
  - orden: relevancia, precio ↑/↓, novedades;
  - paginación con `?pagina=N`.
  - Todo con GET: la URL es el estado, se puede compartir y funciona atrás/adelante.
- [x] Facetas con recuento por valor y **disyuntivas**: dentro de un mismo filtro las opciones se suman (OR) y entre filtros se combinan (AND).
- [x] Páginas de categoría: siguen **estáticas** y añaden un formulario de filtros que lleva a `/buscar/?categoria=<handle>` (ver D4).
- [x] Precio y stock mostrados siempre **frescos** (ver §2.3).
- [x] Experimento de navegación entre filtros: medido con 4 demos (§2.3.2) → modelo híbrido (D10); view transitions desactivadas por ahora y Speculation Rules sin probar (§2.6).
- [x] e2e con JS desactivado: buscar, filtrar, ordenar, paginar, búsqueda con erratas y búsqueda sin resultados; y con JS, el modelo híbrido.

### 7-2 (JS mínimo, mejora progresiva)

- [x] Sugerencias mientras se escribe (combobox ARIA) a partir de 2 caracteres, con _debounce_; Enter sin opción marcada sigue llevando a `/buscar/`.
- [x] Productos (solo título) y hasta 2 categorías; "Ver todos los resultados".
- [x] ~~Aplicar los filtros al cambiar una casilla~~: lo resuelve `SearchLive` en 7-1 (D10).
- [x] ~~Cargar el script con `import()` al primer foco~~: medido, cuesta más que cargarlo entero (§2.7.1). Va como bundle propio en todas las páginas (D11).

## 2. Plan

### 2.0 Spike (inicio de 7-1, con permiso para escribir en la infraestructura de dev)

1. Rama `feat/fase7-1-busqueda`. Definir `src/search/product.ts` (§2.1) con el proveedor PostgreSQL, que no necesita configuración, y lanzar `pnpm --filter backend exec medusa db:migrate`. El seed se ejecuta al arrancar en modo `shared`/`worker`.
2. Medir con `curl` contra `POST /store/search`: latencia p50/p95 (50 consultas), `bufnda`, `camisetas` frente a `camiseta`, `jamon` frente a `jamón`, y facetas de categoría y opciones.
3. Instalar la opción A en una **rama aparte** (la dependencia queda pendiente de aprobación hasta que se decida), repetir las mismas medidas y presentar una tabla al usuario → **decisión D1**.
4. Limpiar: se quita la opción descartada y su índice (`db:migrate:search` con la opción que pregunta antes de borrar índices; los índices de Meilisearch se borran desde su API, solo en dev).
5. **Repetir el spike A frente a C después de ampliar `seed:mock` (§2.2)**, para medir facetas más ricas (Talla/Color, etiquetas, stock) antes de cerrar D1 de forma definitiva.

#### 2.0.1 Resultados del spike (04-oct-2026, 1000 productos mock, local)

Montaje: `src/search/product.ts` (PostgreSQL, `language: "spanish"` con `medusa_search_spanish`) y, en la rama local `spike/fase7-meili` (sin push), un índice espejo `product_meili` con `@rokmohar/medusa-plugin-meilisearch@2.3.1` (`localizedAttributes: spa`). Misma definición, mismos datos y misma ruta `POST /store/search`. Script `/tmp/spike-search.mjs`: 5 peticiones de calentamiento + 50 medidas por consulta (tiempo de ida y vuelta HTTP).

| Medida                                                        | C · PostgreSQL                                                                                                                                                                                                   | A · Meilisearch                                                                                                      |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Seed de 1000 productos                                        | 1,4 s                                                                                                                                                                                                            | 6 s                                                                                                                  |
| Latencia texto **con erratas activas** (p50 / p95)            | 41–52 / 43–53 ms; `lampara` 74 / 75 ms                                                                                                                                                                           | 7–9 / 8–10 ms (motor: 1 ms)                                                                                          |
| Latencia texto **sin erratas** (p50)                          | 6–12 ms                                                                                                                                                                                                          | —                                                                                                                    |
| Facetas sin `q` (categoría + opciones + stats de precio)      | 10 / 12 ms                                                                                                                                                                                                       | 10 / 10 ms                                                                                                           |
| `q` + categoría + rango de precio + facetas + orden           | 22 / 26 ms                                                                                                                                                                                                       | 10 / 11 ms                                                                                                           |
| `bufnda`, `bufamda` → Bufanda                                 | ✅ (solo con `search_options.typo_tolerance: true`; si no, 0)                                                                                                                                                    | ✅ (por defecto; se configura por índice, no por consulta)                                                           |
| `camisetas` → camiseta · acentos (`lampara`, `cafe`, `cojin`) | ✅ · ✅                                                                                                                                                                                                          | ✅ · ✅                                                                                                              |
| Prefijo mientras se escribe (`camis`, `lamp`)                 | ✅ (`match_strategy: "last"`)                                                                                                                                                                                    | ✅ (por defecto)                                                                                                     |
| **Precisión con erratas activas**                             | ❌ demasiado amplia: `lampara` 1000 resultados, `bufanda` 250, `bufanda natural` 150 (similitud de trigramas > 0,3 con cualquier texto). `min_score: 0.45` la corrige (50), pero sube la latencia (hasta 108 ms) | ✅ `bufanda` 50, `bufanda natural` 50                                                                                |
| Facetas disyuntivas con `q`                                   | ❌ el recuento de la faceta no coincide con los resultados (`q=bufanda` + `libros`: 0 resultados, faceta `libros: 200`)                                                                                          | ✅ coherentes                                                                                                        |
| RAM en reposo tras indexar                                    | Postgres 47 MiB (sin cambio apreciable)                                                                                                                                                                          | Meilisearch 255 MiB                                                                                                  |
| Dependencias nuevas                                           | ninguna                                                                                                                                                                                                          | plugin + `meilisearch@0.62.x`; sin peers nuevas (react 18.3.1, react-query 5.64.2 y `@medusajs/ui` 4.2.6 ya estaban) |

Observaciones:

- C cumple el objetivo de < 50 ms p95 en casi todas las consultas, pero no en todas (`lampara` 75 ms, `bufanda natural` 52 ms). Y la tolerancia a erratas es del tipo "todo o nada" por consulta (`word_similarity` > 0,3 sobre todo el texto).
- Una alternativa intermedia en C: buscar primero sin erratas (6–12 ms) y repetir con erratas solo si hay 0 resultados. Pendiente de valorar.
- En A, `search_options.typo_tolerance` en la consulta **da error** ("Meilisearch configures typo tolerance per index"). El storefront no debe enviarlo, o el cambio de motor dejaría de ser transparente.
- Corrección del §2.2: los 1000 productos mock **sí** tienen categoría (200 por cada una de las 5); lo que falta son etiquetas y opciones no exclusivas.
- El primer typecheck falló porque hay dos copias de `@medusajs/types` 2.21.2 (peer de vite 7 y 8). Por eso `product.ts` toma los tipos del contexto de la firma de `graphSeed`.

**Decisión D1 = A (Meilisearch)**, tomada por el usuario el 04-oct-2026. Por ahora se registra solo el **proveedor** del plugin, no el paquete completo (pestaña de Meilisearch en el Admin y rutas `/store/meilisearch/*`). Se valorará registrarlo más adelante para facilitar el Admin a usuarios no técnicos; solo afecta al Admin.

#### 2.0.2 Segunda ronda, tras `seed:mock:v2` (1100 productos)

Datos: 6 etiquetas repartidas (~183 productos cada una) y 100 productos `mock-v2-*` (Ropa/Accesorios) con opciones **globales** `Talla` y `Color` (673 variantes, ~1 de cada 5 sin stock) y 4 fotos cada uno. El índice `product` ya está en Meilisearch (`product_v2`) y `product_pg` se mantiene como comparación.

| Consulta                                                  | A · Meilisearch (p50 / p95, resultados)       | C · PostgreSQL (p50 / p95, resultados)                   |
| --------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------- |
| Texto suelto (erratas, plurales, acentos, prefijos)       | 7–8 / 8–11 ms                                 | 49–61 / 50–62 ms; `lampara` 84 / 86 ms y 1017 resultados |
| `q=polo` + Talla M\|L + Color Rojo + facetas disyuntivas  | 8 / 9 ms · 9                                  | 28 / 29 ms · 9                                           |
| Sin `q` + Ropa + etiqueta + Color Azul + orden por precio | 9 / 10 ms · 11                                | 10 / 11 ms · 11                                          |
| `jersei elegnte` + Talla XL                               | 8 / 9 ms · **13** (todos son Jersey Elegante) | 29 / 31 ms · **21** (cuela ruido de Accesorios)          |
| `q=rojo` (valor de opción)                                | 7 / 7 ms · **67**                             | 56 / 56 ms · **284**                                     |
| `q=ecologico` (etiqueta, sin acento)                      | 7 / 8 ms · 183                                | 50 / 51 ms · 183                                         |
| Facetas sin `q` (categoría, etiquetas, opciones, precio)  | 10 / 11 ms                                    | 11 / 12 ms                                               |

- Las facetas de etiquetas y de Talla/Color cuadran en A con los resultados; en C se repite el desajuste de la faceta de categoría cuando hay `q`.
- Reindexado por **eventos**: los ~3000 eventos del seed (`product.updated` por las etiquetas, `product.created`, variantes, inventario) se aplicaron a los dos índices en unos 20 min (~2,5 eventos/s, modo shared en dev). Se tendrá en cuenta para cargas masivas en producción (worker aparte o reindexado manual).
- RAM tras indexar: Meilisearch 302 MiB, Postgres 51 MiB.
- Imágenes: solo se subieron las 400 nuevas (`images:import` las omite si ya están). En BD y bucket hay 4400, sin huérfanas. La caché de Astro (52 000 transformaciones de las 4000 originales) sigue valiendo; el próximo build solo transforma las 400 nuevas.
- **Conclusión: se confirma D1 = A.**

#### 2.0.3 Limpieza (hecha)

- `db:migrate:search` sin flags y sin terminal solo lista y no borra nada: listó `product_meili` y `product_pg`. Con `--execute-all-search` se borraron (`DROP` de `search_pg_product_pg_v1` y del índice `product_meili_v1` en Meilisearch). La versión `product_v1` (PostgreSQL) ya la había retirado el cambio de proveedor.
- En Meilisearch queda solo `product_v2`. En PostgreSQL quedan las tablas del propio módulo (`search_index*`, `search_postgres_index`, vacía) y la configuración `medusa_search_spanish` (inofensiva).
- Quitados: `src/search/product-pg.ts`, `_product-config.ts`, `src/migration-scripts/create-spanish-search-config.ts` y el proveedor `search-postgres`. La rama local `spike/fase7-meili` se borró.
- **Tests y CI**: Jest no puede cargar el cliente `meilisearch` 0.62 (solo ESM). Por eso el módulo de búsqueda solo se registra si existe `MEILISEARCH_HOST`, y es obligatorio en producción. `.env.test(.example)` lo deja vacío (`loadEnv("test")` también lee `.env`), y Medusa usa entonces su proveedor PostgreSQL por defecto. Por eso la definición no fija `provider`.

### 2.1 Backend

> [!WARNING]
> **⚠️ RIESGO DE CPU: reindexado por cambios de stock. Decidido D8 = L (lotes cada 5 min).**
> Producción comparte un solo VPS entre storefront, Medusa (server + worker), Postgres, Redis y Meilisearch.
>
> - Si el índice escuchara `inventory-level.*` y `reservation-item.*`, **cada** pedido (crea y borra reservas), cada ajuste de stock y cada importación de stock reindexaría el producto en el momento. Cada reindexado cuesta 3 consultas (producto, precios y disponibilidad) más una escritura en Meilisearch.
> - Medido en dev (§2.0.2): **~2,5 eventos/s** en modo shared. Una importación de stock de 1000 referencias serían ~7 min de worker ocupado y de Meilisearch reindexando.
> - El filtro "disponible" puede ir con unos minutos de retraso sin problema: el stock **mostrado** se pide fresco al pintar (§2.3) y el carrito valida el stock al añadir.
> - Por eso el índice **NO escucha** `inventory-level.*` ni `reservation-item.*`. Un scheduled job (`src/jobs/search-stock-sync.ts`) recoge los cambios cada 5 min y reindexa cada producto afectado **una sola vez** (§2.1.1).
> - **No añadas** esos eventos a `src/search/product.ts` sin revisar D8: volvería el coste por pedido.
> - Retraso aceptado: el filtro "disponible" puede ir hasta ~5 min por detrás del stock real.

- `src/search/product.ts` (basado en la guía _Product Index Examples_), con estos campos:
  - `id`, `handle`, `thumbnail` (retrievable);
  - `title` (searchable, peso 3), `subtitle`/`description` (searchable);
  - `status` y `sales_channel_ids` (filterable; los usa `/store/search`);
  - `categories{id,name,handle}` (searchable/facetable);
  - `tags{id,value}` (searchable/facetable);
  - `option_values` (`"Título:valor"`, searchable/filterable/facetable);
  - `min_price_eur`/`max_price_eur` (filterable/sortable, faceta stats para el rango), calculados con `QueryContext({ currency_code: "eur" })`;
  - `in_stock` (filterable/facetable);
  - `created_at` (sortable).
- **No se indexa `type`**: el tipo de producto sirve para el IVA (`iva-reducido`…) y no significa nada para el cliente (D3).
- Eventos (los que emite 2.21.2, comprobados en `@medusajs/utils`):
  - `product.*`, `product-variant.*`;
  - `product-option(-value).*`, `product-tag.*`, `product-category.*`;
  - `sales-channel.deleted`;
  - **no** `inventory-level.*` ni `reservation-item.*`: el stock va por lotes (D8, §2.1.1);
  - con `resolve_ids` para pasar de la entidad relacionada al producto.
  - Por confirmar en la implementación: qué evento se emite cuando cambia un precio (hay `PricingEvents`). Mientras tanto la desactualización solo afecta a filtrar y ordenar por precio; el precio **mostrado** siempre es fresco (§2.3).
- `src/api/middlewares.ts`: `configureStoreSearch({ allowed_indexes: { product: true } })`.

#### 2.1.1 D8: cómo mantener `in_stock` al día sin gastar CPU por cada unidad vendida

| Opción                                | Cómo                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | CPU                                                                   | Retraso del filtro            |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------- |
| **E. Por evento** (guía de Medusa)    | `inventory-level.*` y `reservation-item.*` en `events` con `resolve_ids`                                                                                                                                                                                                                                                                                                                                                                                                          | 1 reindexado por pedido o ajuste; en ráfagas, cola larga              | segundos (minutos en ráfagas) |
| **L. Lotes cada X min (recomendada)** | Scheduled job de Medusa (`src/jobs/`, `schedule: "*/5 * * * *"`, solo en el worker). Lee los `inventory_level` y `reservation_item` con `updated_at` o `deleted_at` desde la última ejecución (marca guardada en el módulo de caché/Redis), pasa a ids de producto **sin repetir** y llama a `searchModule.reindex({ index: "product", filters: { id: [...] } })`, que reindexa solo esos documentos, en el sitio y sin cambiar de versión (tipos de `SearchReindexInput` 2.21.2) | 1 pasada cada X min, con 100 ventas del mismo producto = 1 reindexado | ≤ X min                       |
| **N. Nocturno**                       | El mismo job, una vez al día (o `reindex` completo)                                                                                                                                                                                                                                                                                                                                                                                                                               | mínima                                                                | hasta 24 h                    |
| **S. Solo umbral**                    | Por evento, pero solo si el producto cruza 0 (con stock ↔ sin stock)                                                                                                                                                                                                                                                                                                                                                                                                              | la del evento más una consulta para comprobarlo                       | segundos                      |

**Decisión: L con `*/5 * * * *`** (usuario, 2026-10-04). Implementado:

- `src/lib/search-stock-sync.ts` (lógica, con test unitario) y `src/jobs/search-stock-sync.ts` (job `search-stock-sync`).
- Cada pasada:
  1. lee de `inventory_level` y `reservation_item` lo cambiado o borrado (`updated_at`/`deleted_at`, `withDeleted`) desde la marca anterior menos 1 min de solape;
  2. pasa a `inventory_item.variants.product_id` sin repetir;
  3. llama a `reindex({ index: "product", filters: { id } })` en lotes de 500.
- Reservas: crear o borrar una reserva actualiza `reserved_quantity` del nivel (`inventory-module.js`), así que también cambia `inventory_level.updated_at`. Se leen los dos por seguridad.
- La marca va en el módulo de caché (Redis, clave `search:stock-sync:cursor`, TTL 30 días). Sin marca, mira atrás 1 h. Solo avanza si la pasada terminó sin error.
- `reindex` con `filters` es parcial y en el sitio: sin swap, sin catch-up y sin borrar el resto (código de `@medusajs/search` 2.21.2, `utils/seeding.js`). Además usa el lock `search:seed:product`, así que no pisa a un seed en curso.
- El job solo se ejecuta en modo worker o shared (llms-full.txt: "The worker mode handles background tasks, such as scheduled jobs").
- Intervalo configurable con `SEARCH_STOCK_SYNC_CRON`.
- Verificado en dev (con el cron a 1 min para la prueba): poner a 0 las 2 variantes de `mock-v2-panuelo-clasico-039` (`updateInventoryLevelsWorkflow`) → en la siguiente pasada `in_stock: false` ("1 productos reindexados", 1 documento en `product_v3`). Al restaurar 5 y 9 → `true`.

Notas de la comparación:

- **L** agrupa automáticamente: da igual 1 o 500 cambios de stock del mismo producto en 5 min, se reindexa una vez. No añade dependencias (scheduled jobs y `reindex` son de Medusa) y el intervalo se puede configurar con una variable (`SEARCH_STOCK_SYNC_CRON`).
- Si el job falla, los productos se vuelven a recoger en la siguiente pasada (la marca solo avanza si la anterior terminó bien).
- Fuente: llms-full.txt (Scheduled Jobs; Reindexing and Migrations → "Seeding on Demand", reindex con `filters` en el sitio) y `@medusajs/types` 2.21.2 (`SearchReindexInput.filters`/`since`).
- **Precios**: mismo problema con las listas de precios, que según la doc no emiten evento. El mismo job puede reindexar a diario los productos con `price_list` activa (se decidirá con la fase de promociones).
- Español: con C, un _migration script_ que crea `medusa_search_spanish` y la opción `language: "spanish"`; con A, `localizedAttributes`/locale `es`.
- Tests de integración: `integration-tests/http/search.spec.ts`, con `@medusajs/test-utils` y el proveedor PostgreSQL (sin Meilisearch). Hecho: 4 tests:
  - el índice se llena con `in_stock`;
  - los productos en borrador no aparecen en `/store/search`;
  - `product.updated` se refleja;
  - `syncStockToSearch` pasa `in_stock` a `false` al quedarse sin stock.
- Detalles de los tests:
  - En `beforeAll` se espera a que el índice esté `ready`: el runner hace la plantilla de BD tras `beforeAll` y la restaura en cada test, y el seed inicial corre en segundo plano.
  - La ingesta es asíncrona, así que las consultas se reintentan hasta 30 s.
  - `.env.test` usa `REDIS_URL=redis://localhost:6379/1`: antes los tests compartían la DB 0 con dev (colas, caché y la marca de `search-stock-sync`).

### 2.2 Datos mock (para poder probar filtros)

Hoy los 1000 productos mock tienen una sola opción **exclusiva** (`Formato`), 0 etiquetas, y cada uno está en una de las 5 categorías (200 por categoría). Se amplía `seed:mock` (idempotente, con permiso para escribir en la BD de dev):

- opciones **globales** (`is_exclusive: false`, Medusa ≥ 2.16): `Talla` (S/M/L/XL) y `Color` (Rojo/Verde/Azul/Amarillo), combinadas en variantes en una parte del catálogo;
- 5–8 etiquetas repartidas;
- asignación a categorías;
- algunas variantes sin stock.

### 2.3 Storefront `/buscar/` (on-demand, `prerender = false`)

- `src/lib/search.ts` (con Vitest):
  - `parseSearchParams(url)` lee `q`, `categoria[]`, `etiqueta[]`, `opcion[]` (`Talla:M`), `precio_min`, `precio_max`, `disponible`, `orden`, `pagina`;
  - lo valida con zod y lo **normaliza** (orden estable, valores desconocidos fuera; ver el riesgo de caché del §7);
  - `buildSearchBody(params)` construye el árbol de filtros de Medusa con facetas y `disjunctive_facets: true`;
  - `toggleUrl(params, campo, valor)` genera los enlaces de filtro.
- Llamada: `sdk.client.fetch("/store/search", { method: "POST", body })`. El js-sdk 2.21.2 no tiene un método específico (comprobado). Se pagina de 24 en 24.
- **Precio/stock frescos**: con los `id` de la página (≤ 24) se hace una llamada a `sdk.store.product.list({ id, region_id, fields: "…calculated_price…" })` y se pinta con el mismo `ProductCard` que el catálogo. Así la página no necesita `LiveSync`. Es una llamada extra estimada en ~20 ms (se medirá). Con la opción A se podría usar directamente su ruta con precios nativos.
- **Imágenes** (D6): `<Picture>` en una página on-demand transformaría las imágenes en cada petición. Propuesta: en el build, un endpoint prerenderizado genera `cards.json` (`handle` → `src`/`srcset` de la miniatura que **ya** se genera para las tarjetas del catálogo), y `/buscar/` lo lee del disco al arrancar. Así no se usa sharp en tiempo de ejecución. Se verificará con astro-docs (`getImage`) en la implementación; la alternativa es `<Image>` vía `/_image` con caché en Cloudflare.
- Filtros sin JS:
  - un `<form method="get">` con `<fieldset>`/`<legend>` por faceta, casillas con recuento, `<details>` para plegar (abierto en escritorio, cerrado en móvil con CSS) y un botón "Aplicar";
  - "Quitar filtros" con enlaces;
  - el orden es un `<select>` dentro del mismo formulario.
- Estados:
  - sin resultados: sugerencias y enlace a quitar filtros;
  - `q` vacío: navegación por filtros (búsqueda vacía o _placeholder search_);
  - backend caído: mensaje y código 503.
- Cabeceras:
  - `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`. No hay datos personales: el contador del carrito es una server island aparte.
  - `<meta name="robots" content="noindex, follow">` y canonical a `/buscar/?q=…`; las categorías siguen siendo la página indexable.
- Cabecera de la web: el `<form>` de búsqueda en el layout, con `<label>` accesible y `enterkeyhint="search"`. Así cada página tiene una barra de búsqueda con erratas toleradas desde 7-1 (D5).

#### 2.3.1 Implementación (hecha)

- **Código**:
  - `src/lib/search.ts`: parámetros, URL canónica y consultas;
  - `src/lib/facets.ts`: facetas del build y de la búsqueda;
  - `src/lib/search-server.ts`: `loadSearchPage`; `card-cache.ts` (D9), `card-images.ts` (D6), `server-timing.ts`;
  - `src/components/search/*`: `FilterPanel`, `FilterButton`, `ActiveFilters`, `SortForm`, `SearchPagination`, `SearchResults`, `ListingFilters`, `SearchLive` (D10);
  - `src/pages/buscar/index.astro`, `parcial.astro` (fragmento, D10) y `tarjetas.json.ts` (solo build).
- **URL canónica**: los parámetros se ordenan y se quitan los vacíos (por ejemplo `precio_min=` de un formulario). Una URL que no es canónica responde **301** a la canónica.
  - Con esto la caché tiene una sola clave por combinación.
  - Coste: un formulario con el precio vacío hace un viaje de ida y vuelta extra.
- **Facetas disyuntivas**: el modo `disjunctive_facets` de Medusa quita **todos** los filtros de `option_values` a la vez.
  - Si hay ≥ 2 grupos de opciones seleccionados, se lanza una consulta extra `take: 0` por grupo, en la misma petición `queries[]`, para que el recuento de "Color" respete la "Talla" elegida.
  - Dentro de un grupo se combina con OR y entre grupos con AND. Ese AND es **por producto, no por variante**: "Rojo + M" encuentra un producto con una variante roja L y otra azul M.
- **Precio**: el filtro solapa rangos (`max_price_eur ≥ min` y `min_price_eur ≤ max`). Sin texto no hay relevancia, así que el orden por defecto es por nombre (la etiqueta dice "Nombre (A–Z)").
- **Precio y stock frescos**: `getPricedProductsByIds` (≤ 24 ids) se llama con `CARD_FIELDS`, que trae solo lo que pinta la tarjeta (~117 → ~75 ms en dev). `inventory_quantity` es lo que más cuesta, y se mantiene.
- **Imágenes (D6, verificado)**: el endpoint prerenderizado `/buscar/tarjetas.json` llama a `getImage` con las **mismas** opciones que `ProductImage` (`src/lib/images.ts`). Así salen los mismos hashes y no se genera ningún fichero nuevo.
  - Comprobado: 1100 productos y 7700 URLs, todas presentes en `dist/client/_astro`.
  - **No es público**: al terminar el build, la integración `privateCardImages` (`astro.config.mjs`, hook `astro:build:done`) lo mueve de `dist/client/buscar/tarjetas.json` a `dist/server/card-images.json` y quita la carpeta vacía. `/buscar/tarjetas.json` responde 404 (lo comprueba el e2e).
  - `src/lib/card-images.ts` lo lee del disco **una vez por proceso**: sube desde `import.meta.url` hasta `dist/server`.
  - En `/buscar/` no hay ni `/_image` ni sharp en tiempo de ejecución.
- **Facetas de los listados estáticos (D2)**: se calculan en `getStaticPaths` y un valor solo aparece si lo comparten **≥ 2 productos** de la categoría. No llevan recuento; los recuentos reales se ven en `/buscar/`.
- **Medidas iniciales** (servidor de producción local, TTFB p50 de 7 peticiones, 1100 productos): 85–147 ms. El 60 % era traer precio y stock de las 24 tarjetas (`store.product.list`); la búsqueda, 5–15 ms.
- **Tiempos y CPU** (05-oct-2026, repetido con la máquina en reposo, carga 0,5–0,9; backend en `medusa develop`). 70 peticiones por escenario, 100 ms entre ellas, 2 rondas casi iguales; la caché de Medusa se vacía en Redis antes de cada escenario. "Repetidas" = 4 URLs en bucle; "nuevas" = 70 URLs distintas; "mezcla" = 25 % repetidas + 75 % nuevas. CPU = Postgres + Redis + Meilisearch + Medusa + Astro, por petición (cgroups y `/proc`). Banco temporal (no versionado, ya borrado).

  | Configuración                      | Repetidas p50 | Nuevas p50 | Mezcla p50 · p95 | CPU/petición (rep. / nuevas / mezcla) |
  | ---------------------------------- | ------------- | ---------- | ---------------- | ------------------------------------- |
  | Sin caché                          | 94 ms         | 75 ms      | 88 · 128 ms      | 140 / 98 / 98 ms                      |
  | Solo Medusa (`MEDUSA_FF_CACHING`)  | 40 ms         | 70 ms      | 45 · 136 ms      | 57 / 104 / 92 ms                      |
  | **Solo Astro (TTL 30 s), elegida** | 26 ms         | 70 ms      | 24 · 72 ms       | **39 / 75 / 43 ms**                   |
  | Las dos                            | 20 ms         | 65 ms      | 18 · 65 ms       | 34 / 80 / 44 ms                       |
  - **`Server-Timing`** (`src/lib/server-timing.ts`): `search`, `categories`, `cards` y `data` (tiempo hasta tener los datos). Solo con `SERVER_TIMING=true` en runtime; por defecto no se envía. El render no cabe en una cabecera (Astro manda las cabeceras antes del cuerpo): render ≈ TTFB − `data`.
  - **Caché de tarjetas en Astro (D9)** (`src/lib/card-cache.ts`): TTL `SEARCH_CARD_CACHE_TTL` (30 s por defecto; 0 = desactivada), máx. 2000 tarjetas, por proceso. Solo pide a Medusa los ids que faltan.
    > **WARNING**: con la caché de Astro, el precio y el stock de `/buscar/` pueden ir hasta 30 s por detrás, además de los 60 s de `s-maxage` de la CDN. El carrito y el checkout validan siempre.
  - **Caché nativa de Medusa** (`MEDUSA_FF_CACHING`, registrada con Redis en `medusa-config.ts` pero con el _feature flag_ apagado): **descartada** (decisión del usuario, D9). Se invalida bien (un cambio de stock por workflow, una reserva y un cambio de precio se ven al instante), pero:
    - guarda la respuesta de cada consulta exacta: una búsqueda nueva trae otros 24 ids y falla; en búsquedas nuevas gasta **más** CPU que sin caché (104 frente a 98 ms) porque escribe en Redis (~13 000 claves con ~200 búsquedas);
    - con acierto, Medusa sigue gastando ~20 ms de CPU por consulta de tarjetas (medido llamando a Medusa directamente: 53 → 20 ms);
    - la de Astro guarda por tarjeta, así que acierta también en búsquedas distintas que comparten productos; encima de la de Astro, la de Medusa aporta ~5 ms;
    - está marcada `[WIP]` en Medusa 2.21.2 (`feature-flags/caching.js`).
  - Ninguna caché sube la CPU en reposo (Redis 0,7 % con y sin el flag) y la memoria de Astro no cambia con la suya (258 MB tras el banco, igual con TTL 0).
  - Caché de categorías: descartada (1–5 ms).
  - **Un solo panel**: el panel ya no se pinta dos veces (popover en móvil y barra lateral fija en ≥ 1024 px, mismo elemento; `.filter-panel--sidebar` en `global.css`). `/buscar/?q=jersei` pasa de 76 a 69 KB (−9 %; 7 KB con gzip). Lo que pesa es la rejilla: 24 tarjetas × ~3,8 KB, la mitad son atributos `class` de Tailwind. Con gzip la diferencia es de ~1 KB: en red lenta apenas se nota.
  - Meilisearch: `processingTimeMs` 0–3 ms. Cuando la máquina está cargada (contenedores al 25–50 % de CPU), la llamada `/store/search` sube de ~5 a ~50 ms: es la máquina, no el motor.

- **JS**: `/buscar/` carga `CartClient` y `SearchLive` (811 B gzip, §2.3.3). `check:budget` mide el bundle `SearchLive` en `dist/client/_astro`; como la página es on-demand, el e2e (`e2e/buscar.spec.ts`) comprueba que solo carga esos dos, junto con el 301 y la ausencia de `/_image`.
- **Móvil**: el popover está anclado por arriba (`inset: 15dvh 0 auto 0`) para que "Aplicar" no quede tapado por la barra del navegador. La fila de recuento, filtrar y ordenar se reparte en varias líneas y la etiqueta "Ordenar por" queda solo para lectores de pantalla en < 640 px (se salía de la pantalla).

#### 2.3.3 Modelo de filtros definitivo: híbrido "M3 sobre M1" (D10)

- **Sin JS (M1)**: cada valor es un enlace-casilla (`<a role="checkbox" aria-checked>`, `toggleUrl`) con ancla `#f-<grupo>`, así que la página nueva se abre a la altura del filtro. "Solo disponibles" también es enlace. El precio es un formulario GET ("Aplicar precio", vuelve a `#resultados`) y el orden, un `<select>` + "Ordenar".
  - En móvil sin JS el panel (popover) se cierra en cada clic, porque es una navegación; el ancla devuelve al grupo. Aceptado por el usuario.
- **Con JS (M3)**: `src/components/search/SearchLive.astro` (bundle en `/_astro/`, sin imports, **811 B gzip**; excepción de AGENTS §3.4). Intercepta, dentro de `[data-search-root]`:
  - clics en enlaces a `/buscar/` (filtros, chips, paginación; con Ctrl/Cmd/Shift/Alt o botón central se deja la navegación normal);
  - formularios GET a `/buscar/` (precio, orden) y el `change` del orden (se aplica al elegirlo).
  - Pide el fragmento `/buscar/parcial/?…` y sustituye los resultados. La URL va con `pushState` (la canónica, la que devuelve el fragmento tras su 301) y atrás/adelante vuelven a pedirlo.
  - Se conservan el scroll, el panel móvil abierto y el foco de la casilla pulsada (grupo + texto, porque el `href` cambia). La paginación sube a `#resultados`. El recuento nuevo se anuncia en una región `aria-live`.
  - Si algo falla, navega a la URL (igual que sin JS).
- **Fragmento** `src/pages/buscar/parcial.astro` (`partial = true`, astro-docs _page partials_): mismos datos, misma caché pública (`s-maxage=60`), misma URL canónica (301) y `X-Robots-Tag: noindex`.
- **View transitions**: desactivadas en todo el sitio por ahora (decisión del usuario). Lo aprendido en las demos, para cuando se reactiven:
  - no poner `view-transition-name` a la rejilla entera: al cambiar de alto, la captura se estira; mejor un nombre por tarjeta (`card-<id>`) y `object-fit: none` en `::view-transition-old/new` para recortar en vez de escalar;
  - en navegación entre documentos el scroll vuelve arriba y las imágenes lazy aún no están decodificadas: el efecto apenas se ve sin anclas y sin imágenes `eager`;
  - con VT, "listo" llega unos 250 ms más tarde (es la animación, no espera).
- **Imágenes**: solo las 2 primeras tarjetas son `eager` + `fetchpriority=high` (LCP). La prueba de 6 más en `eager` se ha deshecho.

#### 2.3.2 Experimento de modelos de filtro (hecho; demos retiradas)

Para decidir D10 se montaron cuatro páginas de demo temporales (`/demo/filtros/*`, categoría Ropa, solo con `DEMO_FILTERS=true`) y un script de medición con Playwright + CDP. **Se borraron al cerrar 7-1**, junto con la variable `DEMO_FILTERS` (están en el historial de la rama, commits `33ad134` y `85f2080`, por si hiciera falta recuperarlas).

| Modelo          | Sin JS                                | Con JS                                                        |
| --------------- | ------------------------------------- | ------------------------------------------------------------- |
| 1 · cada clic   | enlaces-casilla, cada clic navega     | igual                                                         |
| 2 · aplicar     | casillas + "Aplicar" (formulario GET) | igual                                                         |
| 3 · en el sitio | como 2                                | `fetch` del fragmento al marcar, `pushState`                  |
| 4 · híbrido     | como 1                                | como 3, interceptando los enlaces; foco y scroll se mantienen |

- **Resultado** (05-oct-2026, 3 clics, tiempo hasta "listo" = recuento nuevo + 4 primeras fotos, sin VT): escritorio rápida M1 151–190 ms / híbrido 81–152 ms; móvil rápida 449–592 / 112–544 ms; 4G + CPU ×4 escritorio 944–1632 / 897–1359 ms, móvil 1594–2567 / 1301–2751 ms. Peticiones por clic 27–31 / 4–25; CPU del navegador (4G) 565–818 / 357–686 ms. Con VT, unos +250 ms en todos. El modelo 2 fue el peor y el que menos gustó. → **D10 = híbrido**.
- Sesgo: el servidor de Node local no comprime (Caddy sí en producción).

### 2.4 Páginas de categoría (D4)

Se mantienen **estáticas** (rendimiento y SEO, sin cambios) y añaden un bloque "Filtrar". Es un `<form action="/buscar/">` con `categoria=<handle>` oculto y las facetas **del build** (opciones y etiquetas presentes en esa categoría), sin recuentos en vivo. Al aplicarlo se pasa a `/buscar/`, que ya muestra los recuentos reales. Alternativa a evaluar con el usuario: categorías on-demand con filtros en la misma URL (más simple de entender, pero pierde el HTML estático).

### 2.5 Presupuestos

- `/buscar/`: `CartClient` (≤ 2 KB) + `SearchLive` (**≤ 1 KB gzip**, excepción aprobada en 7-1, AGENTS §3.4). Sin JS funciona igual (modelo 1).
- JS inline de las páginas estáticas (runtime de server islands + LiveSync): límite subido de 1 KB a **1,2 KB gzip** (decisión del usuario). Las props cifradas de las islands cambian de longitud en cada build y varias páginas de categoría ya pasaban de 1024 B (1026–1029 B, también antes de 7-1).
- Lighthouse móvil en `/buscar/?q=…`: Perf ≥ 95, A11y ≥ 95. El SEO bajará por el `noindex`, como en el checkout.
- Respuesta del servidor (TTFB local, `/store/search` + productos): objetivo < 100 ms p95 con 1000 productos; el README §13 pide < 50 ms para la búsqueda en sí.

### 2.6 Experimento: view transitions CSS + Speculation Rules, solo en los filtros

> **Resultado (7-1)**: las view transitions se probaron en las demos (§2.3.2) y se **desactivan** por ahora (decisión del usuario; aprendizajes en §2.3.3). Con el modelo híbrido, la navegación con JS no cambia de documento, así que las Speculation Rules solo ayudarían sin JS: **no se han añadido**; quedan para la fase 13 (README §2). Plan original:

- **View transitions** (doc de Astro: las nativas entre documentos "no añaden JS"): `@view-transition { navigation: auto; }` **solo** en la hoja de `/buscar/`. Hacen falta las dos páginas, así que solo se anima la navegación de `/buscar/` a `/buscar/`. Cuadrícula y facetas con `view-transition-name`, y `prefers-reduced-motion` desactivado.
- **Speculation Rules**: `<script type="speculationrules">` inline **solo en `/buscar/`**, con `prefetch` (no `prerender`, para no cargar el servidor), `where: { href_matches: "/buscar/*" }` y `eagerness: "moderate"` (al pasar el ratón o pulsar).
  - Solo sirve para **enlaces**, así que las facetas se pintan como enlaces-casilla (`<a role="checkbox" aria-checked>` con `toggleUrl`) y no como `<input>`. Habrá que decidir según el resultado y la accesibilidad (se verificará con el MCP de Svelte/Astro y WAI-ARIA).
  - No se usa `prefetch` de Astro ni `clientPrerender` (añaden JS; AGENTS §3.3).
  - CSP: el script inline necesitará su hash cuando llegue la CSP de la fase 11 (se apunta).
- **Medidas**, antes y después, en Chrome móvil simulado: tiempo de navegación de un filtro al siguiente (Performance API `navigation`, `activationStart`), CLS y Lighthouse.
  - Se **mantiene** si mejora y no empeora CLS ni accesibilidad.
  - Si no compensa, se retira y se queda para la fase 13.

### 2.7 Subfase 7-2 (hecha)

> Plan original (sustituido): cargador de ~0,3 KB con `import()` al primer foco, endpoint JSON con miniatura y ≤ 3 KB bajo demanda. Se cambió tras medir (§2.7.1) y por decisión del usuario: la barra debe comportarse **igual en todas las páginas** (también carrito, checkout y pedido, que no llevan `CartClient`).

- **`SiteClient.astro`** (D11): JS común de la web, cargado por `BaseLayout` en **todas** las páginas como bundle en `/_astro/` (caché inmutable; `assetsInlineLimit`). Sin imports. Hoy solo hace las sugerencias; futuras funciones comunes (p. ej. cuenta, fase 9) irán aquí. **862 B gzip** (límite 1,5 KB, `check:budget`).
  - Patrón combobox de la APG ("list autocomplete", sin selección automática). Los atributos `role="combobox"`, `aria-expanded`, `aria-controls` y `aria-autocomplete` los pone el script: sin JS el campo es un `searchbox` normal.
  - Desde 2 caracteres, 200 ms después de dejar de escribir; caché por texto en la página y `AbortController`. Mismo normalizado que el servidor (minúsculas, espacios, ≤ 50), así que no hay 301.
  - ↑/↓ (`aria-activedescendant`), Enter abre la opción marcada (sin opción, envía el formulario), Escape y perder el foco cierran. El recuento se anuncia en una región `aria-live`.
- **`/buscar/sugerencias/`** (`partial = true`): fragmento HTML con ≤ 6 productos (solo título → ficha), ≤ 2 categorías (`«q» en Ropa` → `/buscar/?q=…&categoria=…`) y "Ver todos". Sin precio ni stock. Una consulta a `POST /store/search` (`lib/suggest.ts`): `fields: id,title,handle`, `take: 6` y la faceta `category_handles`. Los nombres salen de `getCategories()`.
  - URL no canónica → 301. `Cache-Control: public, max-age=60, s-maxage=60, stale-while-revalidate=300`, `X-Robots-Tag: noindex`, 503 si el backend falla (el script no muestra nada).
  - Caché en memoria por texto (`lib/suggest-server.ts`, `SEARCH_SUGGEST_CACHE_TTL`, 60 s, 500 entradas; reutiliza `CardCache`).
- Búsqueda por **prefijo** solo en la última palabra (Meilisearch) y erratas desde 5 letras: `bufan` → bufandas, `jersei` → jerséis; `bufn` no sugiere nada (con 4 letras solo hay prefijo).

#### 2.7.1 Mediciones

Dónde cargar el script (build real, gzip, igual en home/categoría/ficha; esbozo de tamaño realista):

| Variante                                      | Inline             | Ficheros                    | Total por página |
| --------------------------------------------- | ------------------ | --------------------------- | ---------------- |
| Sin sugerencias (7-1)                         | 949–1003 B         | `CartClient` 995            | ~1,95 KB         |
| A · inline                                    | **1656–1707 B** ❌ | 995                         | ~2,65 KB         |
| B1 · bundle propio + `import()` al foco       | igual              | 995 + **877** + 753 al foco | 1,87 + 0,75 KB   |
| **B2 · bundle propio, sin imports (elegida)** | igual              | 995 + 786                   | 1,78 KB          |
| C1 · dentro de `CartClient`                   | igual              | 1584                        | 1,58 KB          |
| C2 · dentro de `CartClient` + `import()`      | igual              | 1723 + 753 al foco          | 1,72 + 0,75 KB   |

- Cualquier `import()` dinámico añade **~750 B** del helper de precarga de Vite (`__vitePreload`). Vite 8.3.2 lo inserta siempre en builds de cliente salvo en modo librería y workers; `build.modulePreload: false` no lo quita (código instalado: `getInsertPreload`). Cargar bajo demanda un módulo de < 1 KB no compensa.
- C no da sugerencias en carrito/checkout/pedido (no llevan `CartClient`): descartada por coherencia. B2 cuesta ~200 B y una petición más (una vez: caché inmutable).

Categorías en la misma consulta (20 prefijos × 3, 3 rondas, backend `develop`): p50 7,1–7,7 ms → 7,1–7,5 ms; CPU de Medusa 5,2–5,8 → 4,8–5,2 ms/petición (con 2 picos de 11–12 ms); +100 B por respuesta. **Sin coste apreciable**.

Endpoint completo (Astro `start` + Medusa `develop`, local):

| Caso                         | p50     | CPU Astro   | CPU Medusa   |
| ---------------------------- | ------- | ----------- | ------------ |
| Texto nuevo (fallo de caché) | 2–12 ms | 2–5 ms/pet. | 3–11 ms/pet. |
| Texto repetido (caché Astro) | 1,8 ms  | 1–2 ms/pet. | 0            |

#### 2.7.2 Caché con Cloudflare (fase 11)

Política conjunta; cada capa cubre algo distinto:

| Capa                 | Qué cubre                                                                                          | TTL                                       |
| -------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Navegador            | el mismo usuario borra y vuelve a escribir (más la `Map` de `SiteClient`)                          | `max-age=60`                              |
| Cloudflare           | textos que escriben muchos usuarios ("ca", "cam"…)                                                 | `s-maxage=60, stale-while-revalidate=300` |
| Astro (500 entradas) | lo que llega al origen: fallos de Cloudflare, cada nodo de la CDN por separado, peticiones sin CDN | `SEARCH_SUGGEST_CACHE_TTL` (60 s)         |

- Con Cloudflare, la de Astro recibirá mucho menos tráfico, pero cuesta casi nada (< 1 MB, 0 CPU en reposo) y protege al VPS ante purgas o _bypass_. En la fase 11 se mide el porcentaje de aciertos de Cloudflare; si es muy alto, `SEARCH_SUGGEST_CACHE_TTL=0` la apaga sin tocar código.
- Desfase máximo: ~60 s (Astro) + 60 s (CDN). En sugerencias (solo títulos) es irrelevante. Lo mismo aplica a `/buscar/` (D9).
- Fase 11: limitar la frecuencia (_rate limiting_) de `/buscar/sugerencias/` junto con `/buscar/`.

## 3. Decisiones

| #   | Decisión                                                                                                                                                                               | Motivo                                                                                                                                                        | Fuente consultada                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| D1  | Motor: **A, Meilisearch** como proveedor del Search Module, tras el spike C vs A (§2.0.1–2.0.2)                                                                                        | Medusa 2.21 ya trae un Search Module; Meilisearch gana en latencia y relevancia                                                                               | docs Medusa Search Module, código instalado                                       |
| D2  | **No hace falta el árbol definitivo de opciones** ahora. Las opciones se indexan de forma genérica como `"Título:valor"` y las facetas se generan a partir de lo que devuelve el motor | Los datos reales se pueden cargar después sin tocar código. Basta con decidir **qué títulos son filtrables** y en qué orden se muestran (una lista en config) | guía _Index Option Values as a Facet_                                             |
| D2b | En producción, usar **opciones globales** (`is_exclusive: false`) para Talla, Color, Tamaño…                                                                                           | Así "Rojo" es el mismo valor en todos los productos y la faceta suma bien. Con opciones exclusivas por producto se fragmentan ("rojo" frente a "Rojo")        | tipos de `@medusajs/types` 2.21.2 (`is_exclusive`, `@since 2.16.0`)               |
| D3  | Facetas: categoría, etiquetas, opciones, precio, disponibilidad. **Tipo de producto no**                                                                                               | El tipo se usa para el IVA                                                                                                                                    | —                                                                                 |
| D4  | Categorías estáticas + formulario que lleva a `/buscar/?categoria=`                                                                                                                    | Mantiene el HTML estático y el SEO                                                                                                                            | AGENTS §3.1                                                                       |
| D5  | Barra de búsqueda con erratas en **7-1** (formulario GET en la cabecera, 0 JS); las sugerencias en 7-2                                                                                 | La tolerancia a erratas la da el motor en el servidor; no necesita JS                                                                                         | —                                                                                 |
| D6  | Imágenes en `/buscar/`: reutilizar las miniaturas del build (`card-images.json`, no público)                                                                                           | Evita sharp en cada petición                                                                                                                                  | astro-docs (Image Service: los servicios locales usan un endpoint en on-demand)   |
| D7  | Experimento VT medido en demos (§2.3.2): **VT desactivadas** por ahora; Speculation Rules a la fase 13                                                                                 | Petición del usuario; el efecto apenas se notaba y retrasa "listo" ~250 ms                                                                                    | astro-docs (view transitions, prefetch/clientPrerender)                           |
| D8  | Mantener `in_stock` al día: **L, por lotes cada 5 min** con un scheduled job (§2.1.1); descartados por evento, nocturno y solo al cruzar 0                                             | CPU de un VPS compartido; el filtro tolera minutos de retraso                                                                                                 | llms-full.txt (Scheduled Jobs, Reindexing), tipos `SearchReindexInput` 2.21.2     |
| D9  | Caché: **solo la de Astro** (tarjetas por id, TTL 30 s); `MEDUSA_FF_CACHING` apagado                                                                                                   | Menos CPU por petición en tráfico mixto (43 frente a 92 ms) y acierta en búsquedas distintas; la de Medusa falla en búsquedas nuevas y está `[WIP]`           | banco §2.3.1; código instalado de `@medusajs/framework` (feature flags)           |
| D11 | Sugerencias: **bundle propio `SiteClient`** (≤ 1,5 KB, en todas las páginas, sin `import()`), solo títulos + ≤ 2 categorías; caché en Astro 60 s + Cloudflare (§2.7.2)                 | Medición de 6 variantes (§2.7.1); el usuario quiere la barra igual en todas las páginas y un sitio para el JS común futuro                                    | código instalado de Vite 8.3.2, astro-docs (scripts, page partials), APG combobox |
| D10 | Filtros: **híbrido "M3 sobre M1"** (enlaces sin JS; en el sitio con `SearchLive`, ≤ 1 KB); view transitions desactivadas por ahora                                                     | Medición de las 4 demos (§2.3.2); el usuario prefiere no recargar y mantener 0 JS como base                                                                   | astro-docs (page partials, script processing)                                     |

## 4. Cómo usarlo

```bash
pnpm infra:up && pnpm dev:backend         # Meilisearch + Medusa; el worker (shared) llena el índice
pnpm backend:seed:mock:v2                 # opcional: etiquetas + 100 productos con Talla/Color
pnpm --filter backend exec medusa db:migrate   # tras cambiar src/search/*.ts
```

- `/buscar/?q=…` (también desde la barra de la cabecera). La URL es el estado: `categoria`, `etiqueta`, `opcion=Talla:M`, `precio_min`, `precio_max`, `disponible=1`, `orden`, `pagina`. Las no canónicas responden 301.
- Variables del storefront (runtime, `apps/storefront/.env.example`):
  - `SEARCH_CARD_CACHE_TTL` (s, por defecto 30; 0 = sin caché de tarjetas, D9);
  - `SEARCH_SUGGEST_CACHE_TTL` (s, por defecto 60; 0 = sin caché de sugerencias, D11);
  - `SERVER_TIMING=true` → cabecera `Server-Timing` (`search`, `categories`, `cards`, `data`) en `/buscar/` y `/buscar/parcial/`.
- Backend: `SEARCH_STOCK_SYNC_CRON` (por defecto cada 5 min, D8). Sin `MEILISEARCH_HOST` (tests/CI) se usa el proveedor PostgreSQL.

## 5. Cómo testear

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test   # 78 unit del storefront
pnpm --filter backend test:integration:http                    # índice, búsqueda y job de stock
pnpm --filter storefront build && pnpm --filter storefront check:budget
# → OK; CartClient ~992 B, SiteClient ~862 B (≤ 1,5 KB), SearchLive ~811 B (≤ 1 KB), inline ≤ 1,2 KB
cd apps/storefront && pnpm start &                              # :4321, con backend en marcha
pnpm --filter storefront test:e2e                               # todo en verde (escritorio + móvil)
curl -sI 'localhost:4321/buscar/?q=bufnda' | head -1           # 200; la página muestra "Bufanda…"
curl -sI 'localhost:4321/buscar/tarjetas.json' | head -1        # 404 (manifiesto no público)
curl -s 'localhost:4321/buscar/sugerencias/?q=bufan'            # fragmento: bufandas, «bufan» en Accesorios, Ver todos
```

Manual: en `/buscar/?categoria=ropa`, con JS desactivado cada casilla navega y abre en su grupo; con JS, se aplica sin recargar, con foco y scroll, y "atrás" deshace el filtro.

Manual (7-2): escribir `cami` en la cabecera (también en `/carrito/`) → lista con camisetas, «cami» en Ropa y "Ver todos"; ↓/↑ marcan, Enter abre, Escape cierra; con lector de pantalla se anuncia el recuento. Sin JS: no hay lista y Enter busca.

## 6. Criterio de salida

- **7-1** ✅:
  - [x] buscar `bufnda` encuentra "bufanda";
  - [x] los filtros, el orden y la paginación funcionan **sin JS** y con la URL compartible;
  - [x] las facetas cuadran con los resultados (disyuntivas, e2e);
  - [x] el precio y el stock son frescos (≤ 30 s con la caché de Astro, D9);
  - [x] 0 KB de JS nuevo sin JS; con JS, `SearchLive` 811 B gzip solo en `/buscar/` (excepción aprobada, D10);
  - [x] < 50 ms en la búsqueda del backend (Meilisearch: 5–11 ms p50 local);
  - [x] e2e en verde (51);
  - [x] experimento medido y decidido (D7, D10).
- **7-2** ✅:
  - [x] sugerencias accesibles con el teclado (combobox APG, e2e);
  - [x] JS: `SiteClient` 862 B gzip en todas las páginas (excepción aprobada, D11; el criterio original "sin cambios en el JS inicial" se sustituyó tras medir, §2.7.1);
  - [x] categorías sin coste apreciable (§2.7.1); sin JS todo funciona igual;
  - [x] e2e en verde (`e2e/sugerencias.spec.ts`).

## 7. Pendientes / riesgos

- ⚠️ **CPU del VPS compartido por el reindexado de stock**: resuelto con D8 = L (§2.1.1), job cada 5 min. **No** añadir eventos de inventario ni de reservas al índice. Una importación masiva de stock se reindexa en la siguiente pasada, en lotes de 500.

- **API reciente**: el Search Module apareció en 2.19–2.21 y ha cambiado en cada minor. Las subidas de Medusa vía Renovate pueden romper el índice o el proveedor de terceros (opción A). Para controlarlo, tests de integración del índice.
- Seed inicial y eventos **solo en modo worker/shared**: en producción, el `backend-worker` debe tener el módulo y el proveedor configurados (fase 10).
- **Caché**: `/buscar/` con `s-maxage` y combinaciones casi ilimitadas de parámetros. Hay que normalizar la URL (orden de parámetros, valores desconocidos fuera) y en la fase 11 limitar la búsqueda (_rate limiting_) en Caddy/Cloudflare (AGENTS §10).
- Desfase del índice con los precios (filtrar y ordenar por precio): hay que confirmar el evento de precios. El precio mostrado no se ve afectado.
- `noindex` en `/buscar/` y canonical: revisar en la fase 11 (SEO) junto con el sitemap.
- `card-images.json` (antes `/buscar/tarjetas.json`) ya **no es público** (§2.3.1). Pesa ~1 MB con 1100 productos y se carga entero en la memoria del proceso.
- ⚠️ **Caché de tarjetas en Astro (D9)**: precio y stock de `/buscar/` hasta 30 s por detrás (`SEARCH_CARD_CACHE_TTL`), más los 60 s de la CDN. Es por proceso y no se invalida con eventos. El carrito y el checkout validan siempre.
- `SearchLive` sustituye el HTML de los resultados con `innerHTML`: el fragmento es nuestro (mismo origen) y no lleva `<script>`; con la CSP de la fase 11 no necesita hash (va en `/_astro/`).
- **Productos creados después del último build** salen en `/buscar/` con la imagen genérica hasta el siguiente build (D6).
- **Datos mock**: la opción "Formato" la comparten 200 productos, así que la regla de "≥ 2 productos" no la oculta y sale en los filtros de las categorías. Es un problema de los datos mock, no del código.
- **Las opciones combinadas** ("Rojo" + "M") se cumplen por producto, no por la misma variante (§2.3.1).
- **Sugerencias (7-2)**: el fragmento se inserta con `innerHTML` (mismo origen, sin `<script>`; la CSP de la fase 11 no necesita hash). Cada pulsación con ≥ 2 letras puede ser una petición al origen si la CDN falla: `rate limiting` en la fase 11 y caché de Astro (§2.7.2).
- Las erratas solo se toleran desde 5 letras (configuración por defecto de Meilisearch): `bufn` no sugiere nada. Si molesta, se ajusta `typoTolerance.minWordSizeForTypos` del índice en el backend (no desde el storefront).
- Ramas rebasadas sobre `main` (PR #23 de Renovate; lockfile regenerado con pnpm 12.9.1). Pendiente: push y PR de 7-1 y después de 7-2.
