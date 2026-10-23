# Fase F — Mejoras en filtros

> **Estado:** ✅ completada (23-oct-2026)
> **Rama/PR:** `feat/fase-f-filtros` · PR #…
> **Anterior:** [Fase O](./faseO-variantes.md) · **Siguiente:** más peticiones de la fase de problemas de frontend y backend

Problemas de los filtros que encontró el usuario al probar el catálogo, casi todos en `/buscar/`, que no coincidía con los listados estáticos.

## 1. Objetivos

- [x] **F-1** Rango de precio real en `/buscar/`.
- [x] **F-1** Sin filtro de materia seca en categorías sin analíticos.
- [x] **F-2** Sin «Formato: Única» en `/buscar/` (grupo de opciones con un solo valor).
- [x] **F-3** Subcategorías sangradas bajo su padre en el filtro «Categoría».
- [x] **F-4** «Solo disponibles» destacado, arriba del panel (al revisarlo, el usuario decidió dejarlo solo en el panel).
- [x] **F-5** Sin saltos de la rejilla (CLS): fila de chips reservada y fila de categorías en todos los listados.

## 2. Qué se ha hecho

### F-1 Rango de precio y materia seca (`lib/search.ts`)

- **Precio**: el «Máximo» salía del precio más barato de cada producto (`min_price_eur`), así que en Ropa daba 17–28 € y había productos de 36 €. Ahora se piden al motor las estadísticas de `min_price_eur` **y** de `max_price_eur`, y el rango va del mínimo de los baratos al máximo de los caros. Es lo mismo que calculan los listados del build (Ropa: 17–36 € en los dos).
- **Materia seca**: Meilisearch solo da `facetStats` de valores numéricos. Sin ninguno, el proveedor (`@rokmohar/medusa-plugin-meilisearch` 2.3.1, `utils/query.js`) contesta `0 / 0`, y el panel lo tomaba por un rango. `statsRange()` descarta el rango si mínimo y máximo coinciden, igual que `intRange` en los listados, **salvo que ese filtro ya esté aplicado**: así se puede cambiar o quitar aunque quede un solo valor.

### F-2 «Formato: Única» en `/buscar/` (`lib/facets.ts`)

`facetsFromSearch` aplica la regla de la Fase O de los listados: un grupo de opciones con un solo valor no filtra nada y no sale, salvo que ese valor esté marcado (para poder desmarcarlo). Higiene ya no enseña «Formato» ni en el listado ni en `/buscar/`.

### F-3 Sangrado de subcategorías

- `categoryIndent()` (`lib/categories.ts`) calcula el nivel de cada categoría que se ofrece respecto a la menos profunda.
- `loadSearchPage` lo añade a los valores del grupo (`depth`).
- `FilterPanel` lo pinta con `.facet-indent-1` / `-2`: margen y una línea a la izquierda (`global.css`).
- Ejemplo: Perro → Alimentación (nivel 1) → Piensos, BARF… (nivel 2).

### F-4 «Solo disponibles» (`StockToggle.astro`)

- **Interruptor** (`role="switch"`) con el estilo de los botones de la web (`.stock-toggle`: trazo de 2 px, sombra retro, fondo primario encendido; mismos colores que los botones primarios, AA comprobado en `theme.test.ts`).
- **Lo primero del panel**: en `/buscar/` es un enlace que alterna el filtro (`#f-disponible`); en las categorías estáticas, la casilla del formulario «Aplicar».
- Primero se puso también fuera del panel (barra de resultados y junto a «Filtrar»); al revisarlo, el usuario lo dejó **solo en el panel**.
- Solo sale si hay productos con y sin stock (`stockFilter`), como antes.
- **Con JS**, `SearchLive` lo aplica en el sitio, como los demás filtros, y le devuelve el foco. Ahora busca los enlaces con cualquier `role`; en `/buscar/` solo lo tienen las casillas y el interruptor. Peso: **982 B gzip** (antes 947 B; ≤ 1 KB).

### F-5 Sin saltos de la rejilla

- **Chips de filtros aplicados** (`ActiveFilters.astro`): la fila existe **siempre**, con la altura de un chip reservada (`.chip-row`, 2,25 rem), en una sola línea con scroll horizontal. Aplicar el primer filtro, quitar el último o tener muchos ya no mueve la rejilla. Vacía, va con `aria-hidden`.
- **Fila de categorías** (`CategoryNav.astro`, `categoryRow()` en `lib/categories.ts`): en todos los listados, de altura fija (`.cat-row`, 3 rem) y en una línea con scroll:
  - padre → sus hijas (como antes);
  - hoja → sus **hermanas**, con la actual marcada (`aria-current="page"`, fondo primario);
  - `/productos/` y hojas sin hermanas → las categorías raíz.
- La rejilla empieza a la misma altura en `/productos/`, Perro, Accesorios, Ropa, Arneses, Piensos y Libros (370 px en móvil, 334 px en escritorio).
- **Arrastre con ratón** (`ScrollDrag`, AGENTS §3.4) en las dos filas: ahora escucha en `document`, así sirve también para la fila de chips que `SearchLive` sustituye al filtrar. 373 B gzip (antes 361). Lo cargan ya las categorías, `/productos/` y `/buscar/`, aprobado por el usuario y en caché desde la home.

## 3. Decisiones tomadas

| Decisión                                                                | Motivo                                                                                                                            | Fuente consultada                                                                          |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Rango = mín. de `min_price_eur` – máx. de `max_price_eur`               | Es el rango real de variantes; el filtro ya compara por solape (`max ≥ mín`, `min ≤ máx`)                                         | Índice `src/search/product.ts`; meilisearch-docs (facetStats)                              |
| Rango con mínimo = máximo → sin filtro, salvo aplicado                  | El proveedor da `0 / 0` sin datos; con el filtro puesto hay que poder cambiarlo                                                   | meilisearch-docs («facetStats only considers values stored as JSON numbers»); plugin 2.3.1 |
| Misma regla de «≥ 2 valores» en `/buscar/` que en los listados          | Coherencia entre las dos páginas (Fase O)                                                                                         | —                                                                                          |
| «Solo disponibles» como interruptor, arriba del panel y también fuera   | Decisión del usuario: es el filtro más útil y pasaba desapercibido al final de la lista                                           | WAI-ARIA (`role="switch"`)                                                                 |
| En las categorías estáticas, el interruptor de fuera lleva a `/buscar/` | El HTML del build no puede filtrar por stock; `/buscar/` ya tiene la categoría y los recuentos en vivo (como «Aplicar», fase 7-1) | —                                                                                          |

## 4. Cómo usarlo

Nada nuevo para la tienda: los filtros se calculan solos. «Solo disponibles» aparece cuando en el listado o en la búsqueda hay productos agotados.

## 5. Cómo testear esta fase

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test   # storefront 260, backend 107, emails 20
STOREFRONT_DATA=fixtures pnpm build && pnpm --filter storefront check:budget   # SearchLive 982 B
pnpm --filter storefront build && pnpm --filter storefront test:e2e   # 217 (11 omitidos)
```

- `e2e/buscar.spec.ts` (38):
  - rango de Ropa igual en el listado y en `/buscar/`;
  - sin materia seca en Ropa;
  - sin «Formato» en Higiene;
  - sangría Perro → Alimentación → Piensos;
  - «Solo disponibles» lo primero del panel y en ningún otro sitio (con JS: en el sitio y con el foco);
  - la rejilla no se mueve al filtrar (sin JS y con JS, también con muchos chips) ni al pasar de un padre a una hoja (hermanas con `aria-current`) o a `/productos/`;
  - `/buscar/` carga SiteClient, CartClient, SearchLive y ScrollDrag.
- Unitarios: `statsRange` / rango de precio / materia seca vacía (`search.test.ts`) y grupo de un solo valor (`facets.test.ts`).
- Lighthouse móvil (build real, brotli): `/buscar/?categoria=perro&categoria=alimentacion-perro` y `/categoria/perro/` 99 / 100 / 100; con F-5, `/buscar/?categoria=ropa-perro&opcion=Talla:M` 98 / 100 / 100 (CLS 0,001), `/categoria/ropa-perro/` y `/productos/` 99 / 100 / 100 (CLS ≤ 0,002).
- A mano: `/buscar/?categoria=ropa-perro` (precio 17–36, sin proteína ni grasa; filtrar no mueve la rejilla); `/buscar/?categoria=higiene-cuidados-perro` (sin Formato; «Solo disponibles» arriba del panel); `/categoria/accesorios-perro/` → Ropa (hermanas, Ropa marcada, la rejilla no salta).

**Nota para los e2e en otro puerto**: el checkout con Stripe vuelve a `SITE_URL` (`localhost`). Para servir el build en otro puerto sin tocar `:4321`, hay que usar `localhost` (`E2E_BASE_URL=http://localhost:4400`), no `127.0.0.1`: si no, la cookie del carrito no viaja y fallan los 8 tests de pago.

## 6. Criterio de salida

- [x] El rango de precio de `/buscar/` coincide con el del listado y es real.
- [x] Sin materia seca ni «Formato: Única» fuera de contexto en `/buscar/`.
- [x] Subcategorías sangradas.
- [x] «Solo disponibles» visible arriba del panel, con y sin JS.
- [x] La rejilla no se mueve al filtrar ni al navegar entre categorías.
- [x] `SearchLive` ≤ 1 KB; batería completa en verde.

## 7. Pendientes / riesgos

- `SearchLive` queda a 42 B de su límite (982 de 1024 B). Lo próximo que necesite `/buscar/` en JS obliga a recortar algo o a revisar el límite (AGENTS §3.4).
- **Stock de correas en la BD local**: `e2e/correas.spec.ts` («medida exacta… 7 m») falla porque 26 pedidos de pruebas anteriores tienen reservados 195 de los 200 m de `CUERDA-AZUL-NYLON`. No es de esta fase: `stock:mock` no repone las piezas de las correas.
- El rango de precio sale de números redondeados (17–36). Un producto de 35,95 € entra con «Máximo 36», que es lo que se busca.
