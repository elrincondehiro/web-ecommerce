# Fase S — Catálogo en el storefront (subcategorías, €/kg, analíticos, granel)

> **Estado:** ⏳ planificada
> **Rama/PR:** `feat/storefront-subcategorias` (y siguientes, una por entrega) · PR #…
> **Anterior:** [Fase C — Importador de catálogo](./faseC-catalogo.md) · **Siguiente:** fase 11 (producción, [ESTADO §6.5](../ESTADO.md))

Mostrar en el storefront lo que la [Fase C](./faseC-catalogo.md) ya carga en Medusa. Contrato de datos en [`apps/backend/catalog/plantilla/LEEME.md`](../../apps/backend/catalog/plantilla/LEEME.md) y [ESTADO §6.8](../ESTADO.md).

## 1. Objetivos

Propuesta de entregas (el orden y el corte se acuerdan con el usuario al planificar):

- [ ] **S-1 Subcategorías + manifiesto de LiveSync**
  - [ ] Páginas `/categorias/<handle>/` para **todas** las categorías (hoy solo las principales; `getCategories()` en `src/lib/medusa.ts`).
  - [ ] El listado de una categoría incluye los productos de sus **descendientes** (en build y en LiveSync), sin duplicados.
  - [ ] Migas (y JSON-LD `BreadcrumbList`) con la cadena de padres; enlaces a las hijas en la página del padre.
  - [ ] Navegación: menú de la cabecera / home con la jerarquía (perro, gato, «Para ti») sin JS nuevo (`popover`/`<details>`).
  - [ ] Filtro de categoría de `/buscar/` y del panel «Filtrar» coherente con la jerarquía (índice `src/search/product.ts`: ¿handles de ancestros?).
  - [ ] **D-S1**: LiveSync por **manifiesto de páginas** en categorías, `/productos/` y carrusel de la home (generalizar `lib/offer-pages.ts` + `privateBuildManifests`).
  - [ ] `sitemap` con las nuevas páginas.
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

(al cerrar)

## 3. Decisiones tomadas

| Decisión                                                                                         | Motivo                                                                                                                                                                                                                                                                  | Fuente consultada                                                                          |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **D-S1**: manifiesto de páginas para LiveSync en todos los listados; descartada la ventana ancha | Análisis en [ESTADO §6.8](../ESTADO.md): correcto aunque Medusa cambie sin rebuild, 0 B de JS de cliente, ~140 KB por 1000 productos en `dist/server`; la island deja de repetir la consulta del build (imprescindible con subcategorías y con el orden de ESTADO §6.7) | Código actual: `LiveSyncData.astro`, `live-sync.ts`, `offer-pages.ts`, `build-manifest.ts` |

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
- Tamaño del build: más páginas de categoría (37 en la hoja real) × paginación; vigilar tiempo de build y `dist/`.
- El handle de las subcategorías debe ser único (ya lo exige el importador: sufijos `-perro`/`-gato`).
- Antiparasitarios: posible medicamento veterinario regulado (RD 666/2023), revisar con la gestoría antes de publicarlos.
