# Fase E — Estructura de URL, descatalogados y productos especiales (correas)

> **Estado:** ✅ cerrada (14-oct-2026): E-0 revertida (#49), E-1 (#48), L-1 (#50), E-2 correa a medida (E-2a medida; E-2b, E-2c y E-2d en `feat/correas`)
> **Rama/PR:** E-1 `feat/fase-e` (#48) · L-1 `perf/livesync-tarjetas` (#50) · E-2 `feat/correas` · PR #…
> **Anterior:** [Fase S](./faseS-catalogo-storefront.md) · **Siguiente:** fase 11 (producción en Hetzner)

## 1. Objetivos

- [ ] ~~**E-0 CI**~~ (revertida, ver §2): repartir los jobs entre Gitea y GitHub. Un PR tardaba 30–40 min en el runner del homelab (≈10 min en GitHub). Lighthouse, solo en GitHub.
- [x] **E-1 URL** (decidir antes de producción):
  - [x] `/categorias/<handle>/` → `/categoria/<handle>/`, con 301 desde la antigua.
  - [x] Productos retirados: **descatalogado** (ficha con aviso, `noindex`; fuera de listados, búsqueda y sitemap; Medusa no deja añadirlo).
  - [x] Redirecciones 301 en un fichero del repo (`src/lib/redirects.mjs`), validadas en el build.
  - [x] Sitemap con `lastmod` en las fichas.
  - [x] Test de colisiones y prefijos reservados (`blog`, `ca`, `eu`, `gl`).
- [x] **E-2 Correa a medida** (constructor con inventario por piezas). Diseño en §3.3.
  - [x] E-2a: medición en local (sin commit), §2.
  - [x] E-2b: backend (`correas:sync`, kits, demanda conjunta de piezas, metadata de la línea, disponibilidad).
  - [x] E-2c: storefront (tarjeta agrupada, página de grupo, ficha con configurador, `CorreaLive`).
  - [x] E-2d: AGENTS (excepción `CorreaLive`), ESTADO, README y cierre.
- [ ] Después: producto combinado de puzles (no es prioritario).

## 2. Qué se ha hecho

### E-0 — CI (`.github/workflows/ci.yml`) — ↩️ REVERTIDA

> El reparto se mergeó en #48 y se deshizo en `fix/ci-revertir-reparto` (`ci.yml` vuelve a ser el de `3a42fa8`).
>
> **Problema**: en el push a `main` en Gitea (28.0.0), `quality` y `audit` se saltaban por el `if:`. `integration` y `lighthouse` (`needs: quality`) se quedaban en estado _Pending_ («Waiting for needed jobs»): la ejecución terminaba, pero el commit quedaba en naranja. GitHub iba bien.
>
> El usuario prefiere el CI completo y duplicado en Gitea a tener ese problema.
>
> **Alternativas descartadas por ahora:**
>
> - quitar los `needs`, con `capacity: 1` en el runner por la RAM;
> - un workflow propio en `.gitea/workflows/`: si existe, Gitea ignora `.github/workflows`, y obliga a mantener dos ficheros.
>
> Fuente: código de Gitea v28.0.0 (`services/actions/run.go`, `job_emitter.go`, `commit_status.go`).
>
> **Reaplicado (15-oct-2026)** tras actualizar Gitea a **28.1.0** (rama `chore/ci-gitea-solo-pr`, `ci.yml` = el de #48). En 28.1 `resolveCheckNeeds` da por terminado un need saltado y el job dependiente se salta también (context7 /go-gitea/gitea, `services/actions/job_emitter.go`). **Comprobar tras el merge** que el push a `main` en Gitea queda sin jobs pendientes (commit en verde o gris, no naranja). Si no, revertir otra vez.
>
> Lo que sigue describe lo que se probó (y lo que vuelve a estar vigente):

- Disparadores: `pull_request` a `main` y `push` de **cualquier rama** (`"**"`, no tags).
- `quality`, `integration` y `audit`: `if: github.server_url == 'https://github.com' || github.event_name == 'pull_request'`.
  - En **Gitea** solo corren en el PR; el push de la rama y el de `main` tras el squash no ejecutan nada.
  - En **GitHub** corren en cada push que llega por el push mirror (sync on commit), también en `main`.
- `lighthouse`: `if: github.server_url == 'https://github.com'` (solo GitHub).
- `concurrency`: un push nuevo a la misma rama o PR cancela el anterior. Los commits de `main` no se cancelan (grupo con `run_id`).
- `integration` sigue con `needs: quality`: el LXC del runner tiene 4 GB y `capacity: 2`.
- Configuración manual (usuario): quitar `lighthouse` de los checks obligatorios de la protección de `main` en Gitea. En el ruleset de GitHub siguen los cuatro.

### E-1 — URL y descatalogados

**Categorías en singular.** Se cambió `src/pages/categorias/` por `src/pages/categoria/` y se actualizaron:

- `categoryHref` (`lib/categories.ts`);
- la cabecera y la home;
- los e2e, `lighthouserc.cjs` y `check-js-budget.mjs`;
- el README.

`/listados/categorias.json` no cambia, porque es un manifiesto interno. La ruta antigua redirige con un 301: `"/categorias/[handle]/[...page]" → "/categoria/[handle]/[...page]"`.

**Redirecciones** (`apps/storefront/src/lib/redirects.mjs`):

- `REDIRECTS` lleva las entradas de origen a destino, sin «/» final.
- `astroRedirects()` las valida y hace fallar el build si alguna está mal: formato, que redirija a sí misma, parámetros distintos en los dos lados o cadenas.
- `astro.config.mjs` → `redirects`. Con `@astrojs/node` las sirve el servidor con un **301 real** (308 si el método no es GET), no con `<meta refresh>`.
- Probado con el build y `curl`:
  - `/categorias/perro/` → 301 a `/categoria/perro/`;
  - `/categorias/piensos-perro/2/` → 301 a `/categoria/piensos-perro/2/`.

**Descatalogado.**

- **Importador** (`catalog-sheet.ts`, `catalog-plan.ts`, `import-catalog.ts`):
  - columnas `descatalogado` (`sí`/`no`) y `sustituto` (handle, `-` lo borra), que se guardan en `metadata.descatalogado` y `metadata.sustituto`;
  - el sustituto tiene que existir en la hoja o en Medusa, y no puede ser el propio producto;
  - el dry-run lista los cambios como «descatalogado» o «sustituto».
- **Backend**:
  - `src/lib/descatalogado.ts` define la clave y el mensaje.
  - El hook del carrito se llamaba `granel-minimo.ts` y ahora es `src/workflows/hooks/validar-carrito.ts`, porque Medusa admite un handler por hook. Rechaza con 400 (`not_allowed`) añadir un descatalogado al crear el carrito o al añadir una línea. No lo rechaza al cambiar la cantidad.
  - El índice `product` tiene el campo `discontinued` (`filterable`, no recuperable). El `definition_hash` cambia, así que `db:migrate` reconstruye el índice (`product_v3`).
- **Storefront**:
  - Listados: `getListedProducts()` (`lib/medusa.ts`) quita los descatalogados de categorías, `/productos/`, ofertas, la home y `buscar/tarjetas.json`. `getAllProducts()` solo lo usan la ficha y el sitemap.
  - Búsqueda: `LISTED_FILTER` (`lib/search.ts`) añade `discontinued $ne true` a la búsqueda y a las sugerencias.
  - Ficha (`producto/[handle].astro`):
    - el aviso «Este producto está descatalogado» sustituye al bloque de compra;
    - lleva un enlace al sustituto o, si no hay, a la categoría o a `/productos/`;
    - es `noindex`, sin JSON-LD `Product` ni LiveSync.
  - Carrito: aviso `discontinued` («Este producto está descatalogado…»).
- **Mock** (`catalog:mock`): hay 6 descatalogados (`i % 50 === 46`), cada uno con sustituto, que es el primer producto de su hoja. En los fixtures, `mock-guiso-eco-046` → `mock-guiso-eco-007`.

**Sitemap con `lastmod`.**

- El endpoint prerenderizado `src/pages/listados/sitemap.json.ts` escribe el `updated_at` de cada ficha y la lista de fichas que hay que excluir.
- La integración `sitemapData()` de `astro.config.mjs` lo lee en `astro:build:done`, antes de que corra `@astrojs/sitemap`, y luego lo borra, así que no queda público.
- `serialize` excluye esas fichas y añade `lastmod`.
- Con fixtures no hay `lastmod`, porque los fixtures no guardan `updated_at` para que sean estables.

**Reglas de URL** (`src/lib/url-rules.test.ts`):

- ninguna página de la raíz, ningún fichero de `public/` y ninguna entrada de `paginas` usa un prefijo reservado;
- las páginas de contenido no chocan con `public/`;
- no hay pares de rutas en singular y plural;
- las redirecciones son válidas y ninguna queda tapada por una página. Astro da prioridad a la ruta de fichero sin avisar.

### Perf L-1 — LiveSync de listados solo con datos de tarjeta (`perf/livesync-tarjetas`)

Mejora aparte, analizada al diseñar las correas.

**Problema.** La island de los listados devolvía una entrada por producto **y otra por variante**, aunque las tarjetas solo usan las de producto. Además pedía a Medusa título, imagen y otros campos que no usa.

**Cambio:**

- `liveEntries(products, { variants })` (`lib/live-sync.ts`): `LiveSyncData` pasa `variants: false` con `pageKey` (listados) y `true` con `productId` (ficha).
- `LIVE_FIELDS` / `fetchLive` (`lib/medusa.ts`): `id,*variants,*variants.calculated_price,+variants.inventory_quantity`.
- El script del navegador (`LIVE_SYNC_APPLY`) **no cambia**, así que tampoco su hash de CSP.
- `ProductCard` solo debe llevar marcas por producto (aviso en el componente).

**Medido en local** (build real, 300 productos mock, 4 peticiones por página sin caché):

| Página                     | Antes (bytes / gzip) | Después (bytes / gzip) | Tiempo     |
| -------------------------- | -------------------- | ---------------------- | ---------- |
| Home (carrusel)            | 2632 / 916           | 739 / 395              | ≈ igual    |
| `/productos/`              | 5464 / 1624          | 1532 / 621             | 72 → 66 ms |
| `/ofertas/`                | 7522 / 1856          | 2083 / 716             | ≈ igual    |
| `/categoria/snacks-perro/` | 5658 / 1372          | 1807 / 633             | ≈ igual    |
| Ficha (6 variantes)        | 261 / 189            | 261 / 189              | 47 → 32 ms |

- Con 24 productos × 20 variantes (estimado), la respuesta pasa de ~40 KB a ~1,3 KB.
- El tiempo en Medusa no cambia: lo marca `inventory_quantity`. Para eso está L-2 (ESTADO §7).

### E-2a — Medición en local (sin commit)

Un producto de prueba con 117 variantes (13 largos × 3 × 3 mosquetones) y 6 piezas, creado y borrado con un script temporal, más un test de integración temporal con el ciclo completo.

| Prueba                                                  | Resultado                                                                                       |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Crear producto + 117 variantes con kit                  | 0,6 s                                                                                           |
| Store API de la ficha (117 variantes, precio y stock)   | 85–165 ms; 161 KB (9,3 KB gzip)                                                                 |
| Disponibilidad del kit (9 m de cuerda, 1 mosquetón MON) | Correcta y redondeando la cuerda: 8 m sí, 9 m no; MON-MON agotada, MON-SEG no                   |
| Cuerda con decimales                                    | Admin (validador `z.number()`, formulario `step: "any"`) y BD (`numeric`) los aceptan           |
| Pedido → reserva → envío                                | Reserva y descuenta 7,5 m y cada pieza                                                          |
| **Dos líneas que comparten pieza**                      | **Sobreventa**: Medusa aceptó 2 × 7,5 m con 9 m de cuerda; tras el envío el stock quedó en −6 m |

Causa de la sobreventa (código de Medusa 2.21.2): `confirmVariantInventoryWorkflow` comprueba cada línea por separado y `createReservationItems` compara cada reserva con el nivel previo al lote (`ensureInventoryLevels`). No suma las demás líneas del carrito. Afecta a dos correas del mismo color con observaciones distintas (líneas distintas) o a dos correas que comparten un tipo de mosquetón. El resto del catálogo no comparte piezas.

### E-2b — Backend de la correa a medida (`feat/correas`)

**Modelo**: un producto por color y material con 117 variantes (largo 3–15 m × mosquetón lado perro × lado mano: Estándar, Montaña, Seguridad). Cada variante es un **inventory kit**:

- cuerda del producto: largo + 0,5 m (en metros, decimal);
- 1 + 1 mosquetones (2 del mismo si coinciden);
- 3 anillas y 2 hebillas.

Precio = `precio_3m` (nailon 24 €, PVC 25 €) + suplemento del largo (4 m +1,50; 5 m +3; después +1 €/m) + recargo de cada mosquetón (Montaña +3, Seguridad +5). Peso = 250 g + 80 g/m (PVC) o 60 g/m (nailon). Categoría `correas-perro` dentro de `paseo-perro`.

**Ficheros:**

- `catalog/plantilla/correas/` (versionada): `correas.csv`, `largos.csv`, `mosquetones.csv`, `piezas.csv`, `ajustes.csv` y `LEEME.md` (abrir un rollo, reponer, cambios habituales). Las 6 correas de prueba (azul, verde y rojo × nailon y PVC) llevan stocks pensados para probar: verde PVC con 9 m de cuerda (máx. 8 m) y rojo nailon a 0 (agotada).
- `scripts/correas-sync.ts` + `lib/correas-sheet.ts` (lectura y validación) + `lib/correas-plan.ts` (productos deseados y diferencias, funciones puras). `pnpm --filter backend correas:sync <carpeta> [dry-run]`. Upsert por handle y SKU: opciones, precio, peso, metadata y kit. Crea las piezas que faltan con `stock_inicial` y **nunca cambia el stock** de las existentes. Borra las variantes de un largo o mosquetón quitado de la hoja. Idempotente.
- `lib/correas.ts`: claves de metadata (`plantilla`/`grupo` = `correa` en el producto; `largo_m`, `mosqueton_perro`, `mosqueton_mano` en la variante) y validación de la metadata de la línea.
- `lib/kit-demand.ts` + hook `validar-carrito.ts`:
  - **demanda conjunta**: al añadir, cambiar cantidad, crear el carrito y **completarlo** (hook `validate` de `completeCartWorkflow`), suma por pieza lo que piden todas las líneas y lo compara con el stock libre de los almacenes del canal. Solo mira piezas que piden ≥ 2 líneas (las de una ya las valida Medusa). Error 400 `insufficient_inventory` «No queda material suficiente…» (el storefront ya lo clasifica como `stock`). Se salta en un carrito ya completado (reintento del webhook de Stripe);
  - **metadata de la línea**: solo las correas la admiten, y solo `observaciones` (≤ 200 caracteres, sin caracteres de control) y `medida_cm` (entero, (largo − 1) m < medida ≤ largo m). Las demás líneas, sin metadata (el storefront no manda ninguna).
- `GET /store/correas/disponibilidad`: por correa publicada del canal, `max_m` (0 = agotada) y `masks` (por largo, 9 bits perro × mano con las combinaciones disponibles). Solo indicadores, nunca cantidades. ~940 B.
- `catalog/*/categorias.csv`: `correas-perro`. El mock no pone productos en ella (`NOT_MOCKED` en `lib/catalog-mock.ts`), así que `catalog/mock/productos.csv` sale idéntico.

**Medido en local** (BD con los 300 mock + 6 correas):

- `correas:sync`: dry-run 3,6 s; crear las 6 correas (702 variantes y 11 piezas) 6,8 s; segunda pasada «6 sin cambios».
- `/store/correas/disponibilidad`: ~200 ms sin caché, casi todo en `query.graph` de los 702 × ~5 enlaces de kit (en SQL directo serían ~10 ms). La island la cachea 60 s; si en producción molesta, se puede leer con SQL o cachear en Redis.
- Búsqueda: las correas se indexan («correa azul» → `correa-azul-nylon`, `correa-azul-pvc`). Agruparlas en una tarjeta es E-2c.
- El storefront actual construye sin cambios (385 páginas, `check:budget` OK; las fichas de correa salen con el selector genérico de 117 variantes hasta E-2c).

### E-2c — Storefront de la correa a medida (`feat/correas`)

**Listados y búsqueda — una tarjeta «Correa a medida»:**

- `lib/correa.ts` (funciones puras, tests en `correa.test.ts`) y `lib/correa-server.ts`.
- `getListingProducts()` (`lib/shop.ts`) junta las correas en un producto sintético (`id = handle = correa-a-medida`, `groupCorreas`), en el sitio de la primera. Lleva las categorías de las correas, todas sus variantes (precio «Desde» y rango de las facetas), sin opciones ni etiquetas.
- Lo usan las categorías, `/productos/` y el carrusel de la home. Las fichas, el sitemap y las ofertas siguen con `getListedProducts`. Las correas no salen en `/ofertas/`, porque el configurador no admite ofertas por variante.
- La tarjeta lleva a la página de grupo («Elegir color y medida»).
- **LiveSync de la tarjeta**: pedir las 6 correas con sus 702 variantes con stock eran ~1 MB y ~300 ms. Ahora:
  - el build escribe `dist/server/correa-cards.json` (`listados/correas.json.ts` + `privateBuildManifests`) con los datos de cada tarjeta y los ids de las variantes del **largo más corto**;
  - la island pide solo esas, con `GET /store/product-variants`.
  - Es válido porque el largo más corto lleva las mismas piezas con menos cuerda: si hay alguna combinación disponible, la del largo más corto con esos mosquetones también lo está, y es la más barata.
- **Búsqueda** (`search-server.ts`):
  - con ≥ 2 correas en la página, una tarjeta de grupo; con una, la suya;
  - el total y los recuentos de las facetas siguen siendo los del motor (cuentan cada color), diferencia aceptada;
  - se quitan las facetas de opción de la correa (largo, mosquetones);
  - la miniatura de la tarjeta de grupo sale de `tarjetas.json` (id sintético).

**Landing `/producto/correa-a-medida/`** (`pages/producto/correa-a-medida.astro`, estática; revisada tras la primera versión de E-2c, que tenía una tarjeta por color):

- Ruta fija que gana a `[handle].astro` (astro-docs, routing «Route Priority Order»). El handle está reservado en tres sitios:
  - el build de las fichas falla si un producto lo usa;
  - `catalog:import` y `correas:sync` lo rechazan (`RESERVED_PRODUCT_HANDLES` en `catalog-sheet.ts`);
  - `url-rules.test.ts` exige que en `pages/producto/` solo estén `[handle]` y `correa-a-medida`.
- Textos en **`src/content/correa.md`** (colección `correa`):
  - frontmatter: título, descripción, entradilla, CTA («A por ella»), **plazo** («Fabricada a mano, con cariño, en 24–48 h laborables.», también en la ficha) e imagen opcional;
  - cuerpo en Markdown: bloques de «cómo la hacemos».
- **Selector de color y material** (`components/correa/ColorPicker.astro`, `mode="radio"`, **0 JS**):
  - muestra de color pintada (`color_hex` de `correas.csv`) por material;
  - debajo, «hasta 15 m» / «hasta 8 m» / «Agotada»;
  - un CTA por correa; CSS `:has()` muestra solo el de la elegida (reglas por handle en `SwatchStyles.astro`). Sin `:has()` se ven todos, cada uno con su color.
- **Tabla de precios** con la primera correa de cada material (`tableProducts`) y el recargo de cada mosquetón.
- **Datos en vivo**: una island (`<LiveSync pageKey correaLanding>`) con el aplicador de siempre:
  - precios de la tabla: 13 + 3 variantes de una correa por material (`GET /store/product-variants`);
  - disponibilidad de todos los colores: `GET /store/correas/disponibilidad`, solo `max_m`;
  - las dos en paralelo; si una falla, se queda lo del build de esa parte.
- JSON-LD `ProductGroup` (`hasVariant` = cada color, `variesBy` color y material) sin `offers`.
- **Escala con el nº de colores**: cada color añade una muestra (~600 B de HTML) y ~150 B a la ruta de disponibilidad; la tabla y sus variantes dependen del nº de materiales, no de colores.

**Ficha de cada color** (`[handle].astro` con `metadata.plantilla = "correa"`):

- Muestras de color de los otros colores (`ColorPicker`, `mode="link"`: enlaces, por material). Migas con «Correa a medida». Sin la lista de opciones. Debajo, el plazo de fabricación (`correa.md`).
- `CorreaBuilder.astro`: formulario estático que funciona **sin JS**:
  - largo: **desplegable** nativo («7 m (29,00 €)», con mosquetones estándar);
  - mosquetón lado perro y lado mano: **dos desplegables** en una rejilla de 2 columnas, también en móvil («Montaña (+3,00 €)»);
  - medida exacta en **cm** (`type=number`, opcional; el texto de ayuda da el tramo del largo);
  - observaciones (`maxlength` 200);
  - cantidad.
- Preselección: el primer largo con stock y su primera combinación disponible.
- **Modelo de precio aditivo**: precio = base(largo) + recargo(perro) + recargo(mano). `correaModel` **falla el build** si un precio de Medusa no lo cumple (variante que falta, precio tocado a mano u oferta en una variante). Así el total del configurador es siempre el que cobra el carrito.
- **Action `cart.addCorrea`** (`actions/index.ts`):
  - recibe `product_id`, `largo`, `perro`, `mano`, `medida_cm`, `observaciones` y `quantity`;
  - **el servidor busca la variante** en la metadata de las variantes del producto (`GET /store/product-variants?product_id=…`, ~40 ms); nunca acepta un `variant_id`;
  - valida la medida (dentro del metro elegido) y las observaciones (recortadas, saltos normalizados, sin caracteres de control) y las manda como `metadata` de la línea. El backend las vuelve a validar.
  - Aviso nuevo `correa` («Revisa la correa…»); `classifyCartError` reconoce los mensajes del hook.
  - La lógica común de añadir con reintento (`addWithRetry`) se comparte con `cart.add`.
- **LiveSync de la ficha** (`correaLive` en `lib/live-sync.ts`):
  - entrada del producto + `_correa` con los datos del configurador: códigos, largos, bases y recargos en céntimos, y máscaras de 9 bits por largo calculadas con `inventory_quantity` (que en un kit es el nº de correas que se pueden hacer). Sin las 117 entradas por variante.
  - Respuesta de 353 B, ~85 ms sin caché. Si los precios actuales no cumplen la fórmula, sin `_correa`.
- **`CorreaLive.astro`** (bundle en `/_astro/`, **788 B gzip**, sin imports; solo en las fichas con `form[data-correa]`; excepción de AGENTS §3.4 aprobada):
  - total en vivo × cantidad;
  - reescribe el texto de cada opción con el precio de esa opción con lo demás elegido y «· agotado»;
  - si la combinación elegida está agotada: aviso «Agotada esta combinación» y botón desactivado;
  - el tramo de la medida sigue al largo, y escribir una medida elige su largo;
  - toma `_correa` de la island si tiene los mismos largos y mosquetones que el HTML.
  - Con JS, «Añadir» va por `CartClient` (fetch + toast), como el resto.
- **Plazo de fabricación**: sin texto todavía (§7).

**Carrito, pedido y emails:**

- `items.metadata` en `CART_FULL_FIELDS` y `ORDER_FIELDS` (de ahí también checkout y «Mi cuenta»).
- «Medida exacta: 6,40 m» y «Observaciones: …» (`lineDetails`) en el carrito, el panel, el resumen del checkout, la confirmación y el pedido de la cuenta.
- Emails: `EmailLineItem.details` (`packages/emails`), `items.metadata` en `ORDER_EMAIL_FIELDS` y `lineDetails` en `apps/backend/src/lib/emails.ts`. Afecta al email de pedido y al de envío. `PreviewProps` con una correa.

**Otros:**

- `check:budget`: bundle `CorreaLive` ≤ 1 KB gzip, obligatorio en las páginas con `data-correa=` y prohibido en las demás (generaliza la regla de `ScrollDrag`).
- Lighthouse CI: añadidas `/producto/correa-a-medida/` y `/producto/correa-verde-pvc/`.
- Fixtures: `correa-azul-nylon` y `correa-verde-pvc` (variantes recortadas a lo que se lee, `update-fixtures.mjs`) y la categoría `correas-perro`. Los demás productos del fixture no cambian (solo se han añadido líneas).
- **`GET /store/correas/disponibilidad`** (E-2b): la usa la **landing** («hasta X m» por color: 939 B para 6 correas, frente a 126 KB de variantes). La ficha no: sus máscaras salen de `inventory_quantity`, que ya pide para el precio.
  - Era lenta (~180 ms) por los ~3300 enlaces de kit. Ahora los enlaces se guardan **en memoria del proceso 5 min** (son estructura, cambian con `correas:sync`); el stock libre se lee siempre fresco: **~70–110 ms**.
  - No se usa la caché de Query de Medusa: en 2.21.2 está detrás del feature flag `MEDUSA_FF_CACHING` («[WIP]», apagado; `@medusajs/medusa/dist/feature-flags/caching.js`). Probado: con `cache: { enable: true }` no cambia nada.
  - El carrito no pasa por ella: valida siempre con datos frescos.
- **Colores**: columna nueva `color_hex` en `correas.csv` (opcional, `#RRGGBB`, validada) → `metadata.color_hex` (lo escribe `correas:sync`; `LEEME.md`). Sin color, la muestra sale gris.

**Qué pasa en la landing** (diagrama):

```
BUILD (una vez por despliegue)
  Medusa ──(correas con sus variantes)──► astro build
     ├─ HTML estático 50 KB (11,4 KB gzip): hero + correa.md, selector (muestras,
     │    «hasta X m» del build, CTAs), tabla de precios (data-price), JSON-LD
     ├─ listing-pages.json   clave → ids de las correas de la tabla (1 por material)
     └─ correa-cards.json    por correa: ids de las variantes de la tabla (t, k)

NAVEGADOR
  1. GET /producto/correa-a-medida/      ← HTML (CDN/caché). LCP aquí.
  2. JS inline del runtime de islands (~1 KB) pide:
     GET /_server-islands/LiveSyncData?p=<pageKey cifrada>   (max-age 30, s-maxage 60, SWR 300)
        │
        ▼  SERVIDOR ASTRO (en paralelo)
        ├─ GET Medusa /store/product-variants?id[]=… (16 por material, ~10 KB)
        │     → precio de cada largo y recargo de cada mosquetón
        └─ GET Medusa /store/correas/disponibilidad (939 B, ~80 ms)
              → max_m por color
        ◄── <template data-live-sync>{…}</template>   2,1 KB (6 colores, 2 materiales)
  3. LIVE_SYNC_APPLY (inline, el de siempre): textos [data-price] (precios y «hasta X m») y
     data-stock de cada muestra (atenúa las agotadas).
  4. El cliente elige color (CSS :has) → «A por ella» → ficha /producto/<handle>/
```

**Medido** (local, build real con 300 mock + 6 correas):

- Landing: **50 KB** de HTML (11,4 KB gzip), sin tarjetas. La primera versión, con 6 tarjetas, ocupaba 66 KB y crecía ~4,8 KB por color.
- Ficha de correa: **44,5 KB** de HTML (antes de E-2c, 184 KB con el selector genérico).
- Islands:
  - landing: 2,1 KB, ~135 ms (variantes de la tabla + disponibilidad en paralelo);
  - ficha: 353 B, ~85 ms;
  - categoría `correas-perro`: 74 B, ~70 ms.
- Ruta de disponibilidad: 939 B, ~70–110 ms (antes ~180 ms).
- Lighthouse móvil (fixtures): landing **100/100/100/100**, LCP 1,4–1,5 s; ficha 99–100/100/100/100, LCP 1,5–1,7 s; CLS ≤ 0,01.
- `check:budget` OK (384 páginas reales / 100 con fixtures). `CorreaLive` 788 B gzip.
- Tests:
  - storefront 217, backend 78, emails 16, integración 28;
  - e2e 139 + 7 saltados: `correas.spec.ts` 16 (landing y ficha, con y sin JS), y checkout con correa (Stripe test + Mailpit) en escritorio.

## 3. Decisiones tomadas

### 3.1 CI

| Decisión                                                                    | Motivo                                                                                                                                                        | Fuente consultada                                                                                           |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Gitea solo en PR y sin Lighthouse; GitHub en cada push (mirror) y con los 4 | El runner del homelab es lento (4 GB, `capacity: 2`) y sus notas de Lighthouse no son representativas. GitHub es público, con minutos ilimitados y más rápido | Análisis de tiempos del usuario (30–40 min frente a ≈10 min)                                                |
| `if:` por job, sin `paths:` ni workflows separados                          | Un job saltado por `if:` informa «skipped» o éxito. Un workflow no disparado deja el check pendiente y bloquea el PR                                          | context7 `/websites/github_en_actions` (control-jobs-with-conditions); `/websites/gitea` (estado `skipped`) |

### 3.2 URL

| Decisión                                                                                                | Motivo                                                                                                                                                                                               | Fuente consultada                                                                             |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Productos planos `/producto/<handle>/`; categorías planas con prefijo `/categoria/<handle>/` (opción A) | Mover un producto de categoría no cambia su URL. La jerarquía va en las migas y en `BreadcrumbList`. El handle ya es único en toda la tienda (`IDX_product_handle_unique`)                           | astro-docs (routing, `getStaticPaths`); Medusa (índices únicos de handle)                     |
| Singular (`/categoria/`, `/producto/`); `/productos/` es el listado                                     | Coherente con `/producto/`. Se cambia ahora, antes de producción: la URL antigua solo existió en desarrollo                                                                                          | —                                                                                             |
| Español sin prefijo; reservados `ca`, `eu`, `gl` y `blog`                                               | Por si algún día hay idiomas cooficiales (i18n de Astro con `prefixDefaultLocale: false`) y para el blog. Ahora no se hace (meter cada contenido ×4 es demasiado trabajo)                            | astro-docs (i18n routing)                                                                     |
| Blog futuro: `/blog/<slug>/`, `/blog/2/`, `/blog/tema/<slug>/`, Content Collections                     | Tras la apertura. JSON-LD `BlogPosting`. El frontmatter lista handles de productos o categorías y el build falla si alguno no existe                                                                 | astro-docs (Content Collections)                                                              |
| Redirecciones en `src/lib/redirects.mjs` → `redirects` de Astro (301 del servidor)                      | Van versionadas y revisadas en PR, y el build las valida. No hace falta Caddy ni Cloudflare. Bulk Redirects de Cloudflare (10 000 en Free) queda como plan B si algún día hay miles                  | astro-docs (configuration-reference#redirects, routing#configured-redirects); cloudflare-docs |
| Sin columna `handle_anterior` en el importador                                                          | La regla es **no cambiar handles**. Si hace falta, se cambia en el Admin y se añade una línea a `redirects.mjs` (aprobado con el plan de E-1)                                                        | —                                                                                             |
| Producto retirado = **descatalogado** (opción i): la ficha sigue, `noindex`, con enlace al sustituto    | Conserva enlaces y visitas sin 404. Fuera de listados, búsqueda y sitemap. Medusa rechaza el alta en el carrito. No se usa borrador, porque la Store API no devuelve borradores y la ficha daría 404 | Medusa (Store API y estado del producto)                                                      |
| `lastmod` desde `updated_at` con un manifiesto de build + `serialize`                                   | `@astrojs/sitemap` no conoce los datos de Medusa. El JSON se borra tras el build                                                                                                                     | astro-docs (sitemap `serialize`, orden de los hooks de integraciones)                         |
| Handler único `validar-carrito.ts` para granel y descatalogado                                          | Medusa registra un solo handler por hook de workflow                                                                                                                                                 | context7 `/medusajs/medusa` (workflow hooks)                                                  |

### 3.3 Correa a medida (E-2)

Respuestas del usuario (13-oct-2026): sin «premium», cada material tiene su precio base (nailon 24 €, PVC 25 €); mosquetones Estándar, Montaña y Seguridad, uno por lado (lado perro / lado mano; fotos por tipo más adelante); peso 250 g + 80 g/m PVC o 60 g/m nailon; categoría nueva `correas-perro` dentro de `paseo-perro`; **medida exacta** (campo `medida_cm`).

| Decisión                                                                  | Por qué                                                                                                                                 | Fuente                                                                                         |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Un producto por color y material; inventory kits de Medusa                | Stock por pieza sin código propio de reservas; 117 variantes por producto rinden bien (E-2a)                                            | context7 `/medusajs/medusa` (inventory kits, `required_quantity`); código de core-flows 2.21.2 |
| Hojas propias + `correas:sync`, no `productos.csv`                        | 702 filas generadas de 5 tablas pequeñas; el precio y el kit salen de una fórmula                                                       | —                                                                                              |
| Demanda conjunta de piezas en el hook (añadir, cambiar, crear, completar) | Medusa comprueba línea a línea (sobreventa medida en E-2a). Al completar, porque el stock puede bajar entre añadir y pagar              | código de core-flows/inventory 2.21.2; context7 (hook `validate` de `completeCartWorkflow`)    |
| Metadata de línea solo en correas y con lista blanca                      | Observaciones y medida exacta van al pedido y a los emails; evita datos arbitrarios del cliente en pedidos de otros productos           | validadores de `/store/carts` 2.21.2 (`metadata` libre)                                        |
| Disponibilidad como máscaras de bits, sin cantidades                      | El configurador desactiva las combinaciones agotadas sin revelar stock; ~940 B para 6 correas                                           | —                                                                                              |
| El script no toca el stock de piezas existentes                           | El stock real (rollo abierto, reservas) se lleva en el Admin; como `stock` en `catalog:import`                                          | —                                                                                              |
| Landing como ruta fija `/producto/correa-a-medida/` (E-2c)                | Una URL indexable para «correa a medida»; la ruta estática gana a `[handle]`, y el handle queda reservado en build, importadores y test | astro-docs (routing «Route Priority Order»)                                                    |
| Variante resuelta en el servidor; precio aditivo comprobado en el build   | El cliente no elige el `variant_id`; el total en vivo no puede diferir del que cobra Medusa                                             | astro-docs (actions: `accept: "form"`, zod)                                                    |
| Disponibilidad desde `inventory_quantity` (no desde la ruta de E-2b)      | Medusa ya da el stock de un kit por variante; una petición menos                                                                        | Store API 2.21.2 (`+variants.inventory_quantity`), medido                                      |
| Tarjetas en vivo con las variantes del largo más corto                    | Mismo «Desde» y stock que con las 117, con ~1/13 de datos                                                                               | medido (1 MB → `/store/product-variants` con 9 por correa)                                     |
| Medida exacta en centímetros enteros                                      | `type=number` sin problemas de coma decimal; es la unidad que guarda el backend (`medida_cm`)                                           | —                                                                                              |

Propuesta original (antes de E-2a):

- **Opción A, recomendada: inventory kits de Medusa.** Cada combinación Color × Largo × Mosquetón es una variante, y cada variante consume:
  - cuerda: (largo + 0,5) m, en unidades de 0,5 m;
  - 2 mosquetones, 3 anillas y 2 hebillas (`required_quantity`).

  La etiqueta y los remaches no llevan inventario. Los precios los genera un script desde una hoja pequeña. Salen unas 540 variantes (10 × 18 × 3), o 1050 con pasos de 0,5 m: hay que medir el rendimiento en local antes.

- La opción B (precio propio en el backend y reserva manual) se descarta por arriesgada.
- **Página**:
  - misma URL `/producto/<handle>/`, con la plantilla elegida por `metadata.plantilla`;
  - `<form>` estático; sin JS muestra la tabla de precios y el servidor resuelve la variante;
  - opcional, un bundle `CorreaBuilder` de 1 KB o menos para el precio en vivo, que sería una **excepción de AGENTS §3.4 pendiente de aprobar**;
  - una server island solo da indicadores de disponibilidad, nunca cantidades.
- **Puzles** (más adelante): receta de bundled products de Medusa, con cada pieza como línea y un descuento por combinación.

## 4. Cómo usarlo

```bash
# Descatalogar: en la hoja, descatalogado = sí (y sustituto = handle, opcional)
pnpm --filter backend catalog:import catalog/<carpeta> dry-run   # «~ handle: descatalogado, sustituto»
pnpm --filter backend catalog:import catalog/<carpeta>
# Búsqueda: al momento. Páginas y sitemap: en el siguiente build del storefront.

# Cambiar un handle (evitarlo): en el Admin + una línea en apps/storefront/src/lib/redirects.mjs
#   "/producto/viejo": "/producto/nuevo",
```

```bash
# Correas a medida (E-2): hojas propias (apps/backend/catalog/plantilla/correas/LEEME.md)
pnpm --filter backend catalog:import catalog/mock                    # categoría correas-perro
pnpm --filter backend correas:sync catalog/plantilla/correas dry-run
pnpm --filter backend correas:sync catalog/plantilla/correas         # 6 correas × 117 variantes
curl -s -H "x-publishable-api-key: $KEY" localhost:9000/store/correas/disponibilidad
```

## 5. Cómo testear esta fase

```bash
pnpm infra:up
pnpm --filter backend exec medusa db:migrate          # índice product_v3 (campo discontinued)
pnpm --filter backend catalog:mock && pnpm --filter backend catalog:import catalog/mock   # 6 descatalogados
pnpm lint && pnpm typecheck && pnpm test               # backend 78, storefront 217, emails 16 (integración: 28)
pnpm --filter backend test:integration:http -- catalogo search   # descatalogado: metadata, carrito 400, búsqueda
pnpm --filter backend test:integration:http -- correas           # E-2b: sync, kits, sobreventa entre líneas, pedido y envío, disponibilidad
# E-2c (storefront, backend en marcha con correas:sync hecho):
pnpm --filter storefront build && pnpm --filter storefront exec playwright test e2e/correas.spec.ts
pnpm --filter storefront exec playwright test e2e/checkout.spec.ts -g correa --project=escritorio   # Stripe test + Mailpit
STOREFRONT_DATA=fixtures pnpm --filter storefront build && pnpm --filter storefront check:budget
# Con el backend en marcha:
pnpm --filter storefront build && pnpm --filter storefront test:e2e   # 139 OK + 7 saltados
curl -sI http://localhost:4321/categorias/perro/ | grep -iE "^(HTTP|location)"   # 301 → /categoria/perro/
```

Resultado obtenido (13-oct-2026):

- Build real: 300 fichas (con los 6 descatalogados) y 379 URL en el sitemap, sin descatalogados y con `lastmod`.
- `check:budget` OK: sin bundles nuevos.

## 6. Criterio de salida

- [x] E-0: probada y revertida (CI como antes).
- [x] E-1: URL, redirecciones, descatalogados, sitemap y reglas de URL, con tests unitarios, de integración y e2e.
- [x] E-2: correa a medida (backend, landing, ficha con configurador, carrito/pedido/emails), con tests unitarios, de integración, e2e con y sin JS y Lighthouse.
- [x] Al cerrar: README §4 (sin cambios de dependencias), ESTADO.md y README §13.

## 7. Pendientes / riesgos

- **Orden de despliegue**: el backend va **antes** que el storefront. Si no, el filtro `discontinued` de la búsqueda apuntaría a un campo que no existe en el índice. En producción, `db:migrate` reconstruye el índice sin cortes (`product_v3`).
- Los carritos que ya tenían un producto antes de descatalogarlo pueden pagarlo, porque el hook no valida al cambiar la cantidad ni al completar. Si no se quiere, basta con dejar su stock a 0.
- Gitea: si se quitó `lighthouse` de los checks obligatorios, volver a ponerlo.
- **E-2**:
  - Fotos de mosquetones: cuando las haya, los desplegables de mosquetón pasan a una rejilla de 3 columnas con foto (no caben en un `<select>`).
  - Búsqueda: el total («13 productos») y los recuentos de facetas cuentan cada color aunque salga una tarjeta de grupo.
  - Una correa con precio fuera del modelo aditivo (p. ej. una oferta en una variante) **rompe el build** a propósito. Si algún día se quieren ofertas en correas, hay que extender el modelo.
  - `/store/correas/disponibilidad` tarda ~200 ms sin caché (ver §2, E-2b).
  - Fotos por tipo de mosquetón: más adelante (opcional, por mosquetón).
  - Plazo de fabricación: «Fabricada a mano, con cariño, en 24–48 h laborables.» (provisional, en `src/content/correa.md`).
- Derecho de desistimiento de los personalizados (TRLGDCU art. 103 c): a la espera de la gestoría.
