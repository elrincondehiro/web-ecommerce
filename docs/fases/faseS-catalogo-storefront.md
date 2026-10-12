# Fase S — Catálogo en el storefront (subcategorías, €/kg, analíticos, granel)

> **Estado:** 🚧 en curso — S-1 hecha (pendiente de PR), S-2 y S-3 planificadas
> **Rama/PR:** `feat/storefront-subcategorias` (y siguientes, una por entrega) · PR #…
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
- [ ] **S-2 Precio por kilo/litro y analíticos**
  - [ ] €/kg con `variant.metadata.neto_g` o €/l con `neto_ml` en ficha (y ¿tarjeta?) (RD 3423/2000; confirmar con la gestoría). Sigue el patrón de precio de LiveSync (AGENTS §3.2).
  - [ ] Tabla de componentes analíticos en la ficha (`product.metadata`).
  - [ ] Filtros por % **sobre materia seca** (`x / (100 − humedad)`, calculado al indexar en `src/search/product.ts`; `medusa db:migrate` reconstruye el índice).
- [ ] **S-3 Granel**
  - [ ] Ficha: selector de gramos (múltiplos de `paso_g` desde `min_g`) que envía `quantity = gramos / paso`; sin JS, `<select>`/`<input type=number step>` en el `<form>` de siempre.
  - [ ] Precio por kilo y total en gramos en una línea («250 g · 5,00 €») en tarjeta, ficha, panel, `/carrito/`, checkout, pedido y emails (`packages/emails`).
  - [ ] Stock mostrado en gramos (`inventory_quantity × paso_g`); mensaje de mínimo del backend visible (toast y sin JS).
  - [ ] Productos a granel de la plantilla pasan a `publicado` cuando esté listo.

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

## 3. Decisiones tomadas

| Decisión                                                                                         | Motivo                                                                                                                                                                                                                                                                  | Fuente consultada                                                                                                                             |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Campo nuevo `category_tree_handles` (no cambiar `category_handles`)                              | El `definition_hash` del Search Module solo depende de `fields`/`settings`/…: un campo nuevo fuerza la reconstrucción con `db:migrate` (sin `--execute-all-search`). Las sugerencias necesitan la categoría directa                                                     | `@medusajs/medusa` 2.21.2 instalado (search loader); context7 `/medusajs/medusa`                                                              |
| Categorías vacías (sin productos en su subárbol): sin página, ni menú, ni home, ni sitemap       | Decisión del usuario; `/store/products?category_id` no incluye descendientes en 2.21.2 → se calcula en el storefront                                                                                                                                                    | `api/store/products/middlewares.js` 2.21.2                                                                                                    |
| Filtro «Categoría» por niveles; elegir hija + padre → filtra la hija                             | Con 37 categorías la lista plana sería inmanejable; dentro del grupo los valores van con OR y el padre ya incluye a la hija                                                                                                                                             | —                                                                                                                                             |
| Árbol de la tienda en `dist/server/shop-categories.json`                                         | Las páginas on-demand (carrito, `/buscar/`) muestran el mismo menú que las estáticas sin consultar a Medusa en cada petición                                                                                                                                            | astro-docs (endpoints estáticos)                                                                                                              |
| **D-S1**: manifiesto de páginas para LiveSync en todos los listados; descartada la ventana ancha | Análisis en [ESTADO §6.8](../ESTADO.md): correcto aunque Medusa cambie sin rebuild, 0 B de JS de cliente, ~140 KB por 1000 productos en `dist/server`; la island deja de repetir la consulta del build (imprescindible con subcategorías y con el orden de ESTADO §6.7) | `LiveSyncData.astro`, `live-sync.ts`, `listing-pages.ts`, `build-manifest.ts`; astro-docs (props de server islands > 2048 B → POST sin caché) |

## 4. Cómo usarlo

(al cerrar)

## 5. Cómo testear esta fase

```bash
# (al cerrar) — como mínimo:
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && STOREFRONT_DATA=fixtures pnpm build
pnpm --filter storefront check:budget
pnpm --filter storefront test:e2e
```

Datos de prueba: cargar la plantilla (`apps/backend/catalog/plantilla`) y la hoja real del usuario (`catalog/mi-carga/categorias.csv`) en dev con `catalog:import`; los fixtures de CI (`STOREFRONT_DATA=fixtures`) necesitarán categorías anidadas y productos con `neto_g`, analíticos y granel.

## 6. Criterio de salida

- [ ] Presupuestos de AGENTS §3.4 sin excepciones nuevas (o aprobadas y anotadas allí).
- [ ] Lighthouse móvil ≥ 95 / 95 / 100 en categorías (padre e hija) y ficha.
- [ ] e2e con JS desactivado para el granel (añadir al carrito con gramos).
- [ ] README §4 sincronizado; ESTADO.md y README §13 actualizados.

## 7. Pendientes / riesgos

- **Antes de planificar, consultar** (REGLA Nº 1): astro-docs (server islands y props, `getStaticPaths`/`paginate`, sitemap, endpoints prerenderizados); context7 `/medusajs/medusa` (`product_category` con `parent_category`/`category_children`, filtro `category_id` con descendientes, `include_descendants_tree`); meilisearch-docs (filtros numéricos/rangos); svelte solo si hiciera falta una isla (preferible que no).
- Si una categoría **cambia de padre**, el Search Module solo reindexa sus productos directos: los de sus subcategorías conservan los ancestros viejos en `category_tree_handles` hasta que se reimporten (o se reconstruya el índice).
- `/store/products` no ordena las variantes por `variant_rank` (todas a 0): en el panel «Talla» sale S, L, M. Queda para S-2 o como issue.
- Tamaño del build: más páginas de categoría (37 en la hoja real) × paginación; vigilar tiempo de build y `dist/`.
- El handle de las subcategorías debe ser único (ya lo exige el importador: sufijos `-perro`/`-gato`).
- Antiparasitarios: posible medicamento veterinario regulado (RD 666/2023), revisar con la gestoría antes de publicarlos.
