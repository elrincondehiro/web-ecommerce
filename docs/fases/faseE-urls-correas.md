# Fase E — Estructura de URL, descatalogados y productos especiales (correas)

> **Estado:** 🚧 en curso: E-0 revertida, E-1 hecha; E-2 (correas) pendiente de las respuestas del usuario
> **Rama/PR:** `feat/fase-e` (sobre `docs/cierre-fase-s`) · PR #…
> **Anterior:** [Fase S](./faseS-catalogo-storefront.md) · **Siguiente:** fase 11 (producción en Hetzner)

## 1. Objetivos

- [ ] ~~**E-0 CI**~~ (revertida, ver §2): repartir los jobs entre Gitea y GitHub. Un PR tardaba 30–40 min en el runner del homelab (≈10 min en GitHub). Lighthouse, solo en GitHub.
- [x] **E-1 URL** (decidir antes de producción):
  - [x] `/categorias/<handle>/` → `/categoria/<handle>/`, con 301 desde la antigua.
  - [x] Productos retirados: **descatalogado** (ficha con aviso, `noindex`; fuera de listados, búsqueda y sitemap; Medusa no deja añadirlo).
  - [x] Redirecciones 301 en un fichero del repo (`src/lib/redirects.mjs`), validadas en el build.
  - [x] Sitemap con `lastmod` en las fichas.
  - [x] Test de colisiones y prefijos reservados (`blog`, `ca`, `eu`, `gl`).
- [ ] **E-2 Correa a medida** (constructor con inventario por piezas). Diseño en §3.3; espera las respuestas del usuario (§7).
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
> Lo que sigue describe lo que se probó:

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

### 3.3 Correa a medida (E-2, propuesta pendiente de respuestas)

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

## 5. Cómo testear esta fase

```bash
pnpm infra:up
pnpm --filter backend exec medusa db:migrate          # índice product_v3 (campo discontinued)
pnpm --filter backend catalog:mock && pnpm --filter backend catalog:import catalog/mock   # 6 descatalogados
pnpm lint && pnpm typecheck && pnpm test               # backend 66, storefront 201, emails 15
pnpm --filter backend test:integration:http -- catalogo search   # descatalogado: metadata, carrito 400, búsqueda
STOREFRONT_DATA=fixtures pnpm --filter storefront build && pnpm --filter storefront check:budget
# Con el backend en marcha:
pnpm --filter storefront build && pnpm --filter storefront test:e2e   # 122 OK + 6 saltados (descatalogado, 301, manifiestos)
curl -sI http://localhost:4321/categorias/perro/ | grep -iE "^(HTTP|location)"   # 301 → /categoria/perro/
```

Resultado obtenido (13-oct-2026):

- Build real: 300 fichas (con los 6 descatalogados) y 379 URL en el sitemap, sin descatalogados y con `lastmod`.
- `check:budget` OK: sin bundles nuevos.

## 6. Criterio de salida

- [x] E-0: probada y revertida (CI como antes).
- [x] E-1: URL, redirecciones, descatalogados, sitemap y reglas de URL, con tests unitarios, de integración y e2e.
- [ ] E-2: correa a medida.
- [ ] Al cerrar: sincronizar README §4, ESTADO.md y README §13.

## 7. Pendientes / riesgos

- **Orden de despliegue**: el backend va **antes** que el storefront. Si no, el filtro `discontinued` de la búsqueda apuntaría a un campo que no existe en el índice. En producción, `db:migrate` reconstruye el índice sin cortes (`product_v3`).
- Los carritos que ya tenían un producto antes de descatalogarlo pueden pagarlo, porque el hook no valida al cambiar la cantidad ni al completar. Si no se quiere, basta con dejar su stock a 0.
- Gitea: si se quitó `lighthouse` de los checks obligatorios, volver a ponerlo.
- **E-2**: faltan las respuestas del usuario.
  - ¿Tiene que salir de un solo tramo de cuerda? ¿Un rollo abierto por color? ¿Se controlan los restos?
  - Fórmula de precio y medios metros.
  - Recargo del mosquetón y del premium: ¿por correa o por pieza o metro?
  - ¿Pueden ser de tipos distintos los dos mosquetones?
  - Colores y muestras.
  - Inventario de anillas y hebillas.
  - Plazo de fabricación y peso.
  - Paso de 1 m o de 0,5 m.
- Derecho de desistimiento de los personalizados (TRLGDCU art. 103 c): a la espera de la gestoría.
