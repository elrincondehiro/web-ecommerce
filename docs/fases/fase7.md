# Fase 7 — Búsqueda y filtros

> **Estado:** ⏳ planificada (plan del 04-oct-2026, **pendiente de aprobación**)
> **Rama/PR:** `docs/fase7-plan` (este plan) · implementación: `feat/fase7-1-busqueda`, `feat/fase7-2-autocompletado`
> **Anterior:** [Fase 5](./fase5.md) · **Siguiente:** por decidir (propuesta: Marca → 8 Emails)

La fase se divide en dos subfases **independientes**. 7-2 solo añade JS encima de lo que entrega 7-1, que funciona completa sin JS.

| Subfase | Contenido                                                                                                                                                                     | JS en cliente                                                        |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **7-1** | Índice de productos, `/buscar/` on-demand con búsqueda tolerante a erratas, filtros, orden y paginación (modo A), barra de búsqueda en la cabecera, experimento de navegación | **0 KB** (salvo lo que ya existe: CartClient)                        |
| **7-2** | Sugerencias mientras se escribe y aplicar los filtros al marcar una casilla, sin pulsar Enter                                                                                 | script de Astro de **~1–3 KB gzip (estimado)**, cargado bajo demanda |

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

> Consecuencia documental: AGENTS §2 y §4 y README §2/§3 dicen que el storefront consulta Meilisearch con una _search-only key_. Con el Search Module eso deja de aplicarse. Se actualizarán en el PR de 7-1.

## 1. Objetivos

### 7-1 (0 JS)

- [ ] Índice `product` (`src/search/product.ts`), con eventos para mantenerlo al día y reindexación desde el Admin.
- [ ] `POST /store/search` habilitado solo para el índice `product` (`configureStoreSearch`).
- [ ] Barra de búsqueda en la cabecera: `<form method="get" action="/buscar/">` con `<input type="search" name="q">`, en todas las páginas. 0 JS.
- [ ] `/buscar/` on-demand con:
  - búsqueda **tolerante a erratas** (la del motor);
  - filtros por **categoría**, **etiquetas**, **opciones** (talla, color…), **rango de precio** y **disponibilidad**;
  - orden: relevancia, precio ↑/↓, novedades;
  - paginación con `?pagina=N`.
  - Todo con GET: la URL es el estado, se puede compartir y funciona atrás/adelante.
- [ ] Facetas con recuento por valor y **disyuntivas**: dentro de un mismo filtro las opciones se suman (OR) y entre filtros se combinan (AND).
- [ ] Páginas de categoría: siguen **estáticas** y añaden un formulario de filtros que lleva a `/buscar/?categoria=<handle>` (ver D4).
- [ ] Precio y stock mostrados siempre **frescos** (ver §2.3).
- [ ] Experimento de navegación entre filtros: view transitions CSS + Speculation Rules, medido (§2.6).
- [ ] e2e con JS desactivado: buscar, filtrar, ordenar, paginar, búsqueda con erratas y búsqueda sin resultados.

### 7-2 (JS mínimo, mejora progresiva)

- [ ] Sugerencias mientras se escribe (combobox ARIA) a partir de 2 caracteres, con _debounce_; Enter sigue llevando a `/buscar/`.
- [ ] Aplicar los filtros al cambiar una casilla (`form.requestSubmit()`). Sin JS sigue estando el botón "Aplicar".
- [ ] El JS inicial del catálogo **no aumenta**: el script de sugerencias se carga con `import()` dinámico la primera vez que el campo recibe el foco.

## 2. Plan

### 2.0 Spike (inicio de 7-1, con permiso para escribir en la infraestructura de dev)

1. Rama `feat/fase7-1-busqueda`. Definir `src/search/product.ts` (§2.1) con el proveedor PostgreSQL, que no necesita configuración, y lanzar `pnpm --filter backend exec medusa db:migrate`. El seed se ejecuta al arrancar en modo `shared`/`worker`.
2. Medir con `curl` contra `POST /store/search`: latencia p50/p95 (50 consultas), `bufnda`, `camisetas` frente a `camiseta`, `jamon` frente a `jamón`, y facetas de categoría y opciones.
3. Instalar la opción A en una **rama aparte** (la dependencia queda pendiente de aprobación hasta que se decida), repetir las mismas medidas y presentar una tabla al usuario → **decisión D1**.
4. Limpiar: se quita la opción descartada y su índice (`db:migrate:search` con la opción que pregunta antes de borrar índices; los índices de Meilisearch se borran desde su API, solo en dev).

### 2.1 Backend

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
  - `inventory-level.*`, `sales-channel.deleted`;
  - con `resolve_ids` para pasar de la entidad relacionada al producto.
  - Por confirmar en la implementación: qué evento se emite cuando cambia un precio (hay `PricingEvents`). Mientras tanto la desactualización solo afecta a filtrar y ordenar por precio; el precio **mostrado** siempre es fresco (§2.3).
- `src/api/middlewares.ts`: `configureStoreSearch({ allowed_indexes: { product: true } })`.
- Español: con C, un _migration script_ que crea `medusa_search_spanish` y la opción `language: "spanish"`; con A, `localizedAttributes`/locale `es`.
- Tests de integración (`medusa-test-utils`): el índice se llena; `product.updated` refleja el cambio; un producto en borrador no aparece.

### 2.2 Datos mock (para poder probar filtros)

Hoy los 1000 productos mock tienen una sola opción **exclusiva** (`Formato`), 0 etiquetas, y las 5 categorías existen pero ningún producto está asignado a ninguna. Se amplía `seed:mock` (idempotente, con permiso para escribir en la BD de dev):

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

### 2.4 Páginas de categoría (D4)

Se mantienen **estáticas** (rendimiento y SEO, sin cambios) y añaden un bloque "Filtrar". Es un `<form action="/buscar/">` con `categoria=<handle>` oculto y las facetas **del build** (opciones y etiquetas presentes en esa categoría), sin recuentos en vivo. Al aplicarlo se pasa a `/buscar/`, que ya muestra los recuentos reales. Alternativa a evaluar con el usuario: categorías on-demand con filtros en la misma URL (más simple de entender, pero pierde el HTML estático).

### 2.5 Presupuestos

- `/buscar/`: **0 KB** de JS propio, salvo CartClient (≤ 2 KB), igual que el catálogo. `check:budget` añade `/buscar/` a las reglas del catálogo.
- Lighthouse móvil en `/buscar/?q=…`: Perf ≥ 95, A11y ≥ 95. El SEO bajará por el `noindex`, como en el checkout.
- Respuesta del servidor (TTFB local, `/store/search` + productos): objetivo < 100 ms p95 con 1000 productos; el README §13 pide < 50 ms para la búsqueda en sí.

### 2.6 Experimento: view transitions CSS + Speculation Rules, solo en los filtros

- **View transitions** (doc de Astro: las nativas entre documentos "no añaden JS"): `@view-transition { navigation: auto; }` **solo** en la hoja de `/buscar/`. Hacen falta las dos páginas, así que solo se anima la navegación de `/buscar/` a `/buscar/`. Cuadrícula y facetas con `view-transition-name`, y `prefers-reduced-motion` desactivado.
- **Speculation Rules**: `<script type="speculationrules">` inline **solo en `/buscar/`**, con `prefetch` (no `prerender`, para no cargar el servidor), `where: { href_matches: "/buscar/*" }` y `eagerness: "moderate"` (al pasar el ratón o pulsar).
  - Solo sirve para **enlaces**, así que las facetas se pintan como enlaces-casilla (`<a role="checkbox" aria-checked>` con `toggleUrl`) y no como `<input>`. Habrá que decidir según el resultado y la accesibilidad (se verificará con el MCP de Svelte/Astro y WAI-ARIA).
  - No se usa `prefetch` de Astro ni `clientPrerender` (añaden JS; AGENTS §3.3).
  - CSP: el script inline necesitará su hash cuando llegue la CSP de la fase 11 (se apunta).
- **Medidas**, antes y después, en Chrome móvil simulado: tiempo de navegación de un filtro al siguiente (Performance API `navigation`, `activationStart`), CLS y Lighthouse.
  - Se **mantiene** si mejora y no empeora CLS ni accesibilidad.
  - Si no compensa, se retira y se queda para la fase 13.

### 2.7 Subfase 7-2

- `src/scripts/search-suggest.ts`:
  - al primer `focus` del campo de la cabecera, `import()` del módulo;
  - `fetch("/buscar/sugerencias.json?q=")` con un _debounce_ de 150 ms y `AbortController`;
  - pinta una lista ARIA _combobox/listbox_ con flechas, Enter y Escape.
- Endpoint Astro on-demand `/buscar/sugerencias.json` → `/store/search` con `fields: [title, handle, thumbnail]` y `take: 6`, cacheado 60 s.
- Auto-aplicar filtros: un `<script>` de Astro mínimo en `/buscar/` (`change` → `form.requestSubmit()`) que oculta el botón "Aplicar" solo cuando hay JS. Si en 7-1 los filtros acaban siendo enlaces, sobra.
- Presupuesto: JS inicial sin cambios (solo el cargador, menos de 0,3 KB estimados). Lo que se carga bajo demanda, ≤ 3 KB gzip.
- e2e con JS: sugerencias y teclado. Sin JS: todo lo de 7-1 sigue funcionando.

## 3. Decisiones (pendientes de confirmar)

| #   | Decisión                                                                                                                                                                               | Motivo                                                                                                                                                        | Fuente consultada                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| D1  | Motor: spike C vs A y elegir (§0)                                                                                                                                                      | Medusa 2.21 ya trae un Search Module; Meilisearch exige un proveedor de terceros o propio                                                                     | docs Medusa Search Module, código instalado                                     |
| D2  | **No hace falta el árbol definitivo de opciones** ahora. Las opciones se indexan de forma genérica como `"Título:valor"` y las facetas se generan a partir de lo que devuelve el motor | Los datos reales se pueden cargar después sin tocar código. Basta con decidir **qué títulos son filtrables** y en qué orden se muestran (una lista en config) | guía _Index Option Values as a Facet_                                           |
| D2b | En producción, usar **opciones globales** (`is_exclusive: false`) para Talla, Color, Tamaño…                                                                                           | Así "Rojo" es el mismo valor en todos los productos y la faceta suma bien. Con opciones exclusivas por producto se fragmentan ("rojo" frente a "Rojo")        | tipos de `@medusajs/types` 2.21.2 (`is_exclusive`, `@since 2.16.0`)             |
| D3  | Facetas: categoría, etiquetas, opciones, precio, disponibilidad. **Tipo de producto no**                                                                                               | El tipo se usa para el IVA                                                                                                                                    | —                                                                               |
| D4  | Categorías estáticas + formulario que lleva a `/buscar/?categoria=`                                                                                                                    | Mantiene el HTML estático y el SEO                                                                                                                            | AGENTS §3.1                                                                     |
| D5  | Barra de búsqueda con erratas en **7-1** (formulario GET en la cabecera, 0 JS); las sugerencias en 7-2                                                                                 | La tolerancia a erratas la da el motor en el servidor; no necesita JS                                                                                         | —                                                                               |
| D6  | Imágenes en `/buscar/`: reutilizar las miniaturas del build (`cards.json`)                                                                                                             | Evita sharp en cada petición                                                                                                                                  | astro-docs (Image Service: los servicios locales usan un endpoint en on-demand) |
| D7  | Experimento VT + Speculation Rules acotado a `/buscar/` y medido                                                                                                                       | Petición del usuario; sin JS                                                                                                                                  | astro-docs (view transitions, prefetch/clientPrerender)                         |

## 4. Cómo usarlo

_(se rellena al cerrar)_

## 5. Cómo testear

_(se rellena al cerrar; previsto: `pnpm --filter storefront test`, `test:e2e` con y sin JS, `check:budget`, `test:integration:http` del backend, Lighthouse en `/buscar/`)_

## 6. Criterio de salida

- **7-1**:
  - buscar `bufnda` encuentra "bufanda";
  - los filtros, el orden y la paginación funcionan **sin JS** y con la URL compartible;
  - las facetas cuadran con los resultados;
  - el precio y el stock son frescos;
  - 0 KB de JS nuevo;
  - < 50 ms en la búsqueda del backend (p95 local, 1000 productos);
  - e2e en verde;
  - experimento VT/SR medido y decidido.
- **7-2**: sugerencias accesibles con el teclado; el JS inicial del catálogo no cambia y lo cargado bajo demanda pesa ≤ 3 KB gzip; e2e en verde.

## 7. Pendientes / riesgos

- **API reciente**: el Search Module apareció en 2.19–2.21 y ha cambiado en cada minor. Las subidas de Medusa vía Renovate pueden romper el índice o el proveedor de terceros (opción A). Para controlarlo, tests de integración del índice.
- Seed inicial y eventos **solo en modo worker/shared**: en producción, el `backend-worker` debe tener el módulo y el proveedor configurados (fase 10).
- **Caché**: `/buscar/` con `s-maxage` y combinaciones casi ilimitadas de parámetros. Hay que normalizar la URL (orden de parámetros, valores desconocidos fuera) y en la fase 11 limitar la búsqueda (_rate limiting_) en Caddy/Cloudflare (AGENTS §10).
- Desfase del índice con los precios (filtrar y ordenar por precio): hay que confirmar el evento de precios. El precio mostrado no se ve afectado.
- Con C, la búsqueda comparte CPU con el checkout en Postgres. Con el tamaño de catálogo previsto no parece un problema (estimación, a validar en el spike).
- `noindex` en `/buscar/` y canonical: revisar en la fase 11 (SEO) junto con el sitemap.
- La CSP (fase 11) necesitará el hash de las Speculation Rules inline si se mantienen.
