# Fase O — Opciones, variantes y plantillas de ficha

> **Estado:** ✅ completada (23-oct-2026)
> **Rama/PR:** `feat/fase-o-variantes` · PR #…
> **Anterior:** [Fase V/W](./faseV-loyverse.md) · **Siguiente:** [Fase F — mejoras en filtros](./faseF-filtros.md)

Primera petición de la fase de problemas detectados al cargar el catálogo real. Un arnés con 9 estampados × 5 tallas era o un producto por estampado (el listado se llenaba y no se podía filtrar por estampado) o un producto con 45 filas de radios en la ficha. Ahora es **un solo producto** con un selector de muestras, fotos por estampado y una guía de tallas por modelo.

## 1. Objetivos

- [x] **O-1** Plantillas de ficha (contenido común por categoría o por producto) y guías de tallas por modelo.
- [x] **O-2** Selector de opciones en la ficha (dos grupos de muestras en vez de la tabla), **sin JS**.
- [x] **O-3** Fotos por valor de opción (`images:import`) y galería que enseña las del valor elegido.
- [x] **O-4** Filtros: opciones con un solo producto, opciones no filtrables y grupos del panel plegados.

## 2. Qué se ha hecho

### O-1 Plantillas y guías de tallas

- **Hoja** (`catalog:import`, `apps/backend/src/scripts/lib/catalog-sheet.ts` y `catalog-plan.ts`): columnas de producto `plantilla`, `guia_tallas` (ids de fichero, minúsculas y guiones) y `opcion_fotos` (tiene que ser una opción del producto; se guarda con la grafía de su columna). Van a la metadata del producto; `-` las borra. Documentadas en `catalog/plantilla/LEEME.md` («Fichas con plantilla y selector»).
- **Storefront**:
  - Content Collections `plantillas` (`src/content/plantillas/<id>.md`: `titulo`, `boton`, `categorias`) y `guias` (`src/content/guias/<id>.md`: `titulo`, `marca`).
  - `lib/plantillas.ts` decide la plantilla: `metadata.plantilla` → la primera plantilla cuya lista incluye la categoría del producto o una ancestra (de la más concreta a la raíz) → ninguna. El build **falla** si una ficha apunta a una plantilla o guía que no existe.
  - `ProductGuides.astro`: un botón por bloque abre un `popover` lateral (estilo `.flyout`, el del carrito), que se cierra con ✕, Escape o pulsando fuera. Sin `boton`, el texto de la plantilla va desplegado en la ficha. 0 JS.
  - Plantilla `arnes` (cómo medir, textos provisionales) y tres guías de prueba (`marca-m-arnes-a`, con esquema; `marca-m-arnes-b`; `marca-n-arnes-c`, para probar el cambio de guía desde el Admin).
  - **Fotos en el Markdown** (plantillas y guías): `![alt](./foto.jpg)` con la foto junto al `.md`. Astro la optimiza en el build (WebP, `width`/`height`, `lazy`). Estilo de la web en `.prose-page` (`global.css`): imágenes y tablas con trazo de 2 px, esquinas y sombra retro. Con JS, la foto de una guía solo se descarga al abrirla. Sin JS, Chromium la descarga igualmente: ignora `lazy` cuando no hay JS.
  - **Cambiar la guía de un producto desde el Admin**: metadata del producto `guia_tallas = <id>` y rebuild (probado por el usuario).
- La correa a medida sigue con su propia ficha (`metadata.plantilla = "correa"`, `lib/correa.ts`): no pasa por este registro.

### O-2 Selector de opciones (`lib/variant-picker.ts`, `VariantPicker.astro`)

- **Cuándo sale**:
  - con 2 opciones;
  - con 1 opción cuyos valores tienen foto (`opcion_fotos`) o color (`metadata.color` del valor).
  - Si no, se queda la tabla de siempre (una opción enseña mejor precio y stock por fila).
  - También se queda la tabla con 3 opciones o más, con más de 20 valores en una opción (`MAX_VALUES`) y en productos a granel.
- **Opción A** (la de fuera, la que mueve las fotos): `opcion_fotos` → la que tiene colores → la que no es de tallas → la primera. **Opción B**: la otra. Valores ordenados con `compareValues` (tallas en su orden natural).
- **Sin JS**:
  - Radios `opcion_1` / `opcion_2` («Título:valor») y `product_id` en el formulario de Añadir.
  - `cart.add` y `wishlist.add` buscan la variante en el servidor (`src/actions/resolve-variant.ts` → `findVariantByOptions`, con `GET /store/products/:id` `*options,variants.id,*variants.options`). Si la combinación no existe (p. ej. HTML de un build anterior): aviso nuevo `variant`.
  - El cliente nunca manda un `variant_id` en este modo. La tabla sigue mandándolo como antes.
- **CSS por posición** (`src/styles/variant-picker.css`, **generado** por `pickerCss()`; el test falla si no está al día):
  - Las reglas son las mismas para todas las fichas: van en el CSS de la ficha (`/_astro/`, caché inmutable) y no hacen falta hashes de CSP.
  - Cada talla lleva una marca por valor de A (`data-pa`, `data-pid`, `data-vstock`, precio), y el CSS deja ver solo la del A elegido.
  - Tacha las tallas agotadas y cambia Añadir ↔ Agotado (la insignia de stock también).
  - Peso: **7,6 KB sin comprimir, 0,7 KB gzip** para 20 valores (presupuesto en el test: ≤ 1 KB).
- **LiveSync** no cambia: la ficha ya recibe las entradas por variante y el CSS reacciona a los `data-vstock` y precios que corrige.
- **Colores de las muestras**: `metadata.color` del valor de la opción global (Admin, `#rrggbb` validado), en un `<style>` del `<head>` con su hash (`HeadStyle.astro`, como `SwatchStyles`).
- **♡ del título**: guarda la combinación elegida. Sin JS, la action resuelve la variante con las mismas opciones; con JS, `CartClient` sigue la combinación (1964 B gzip, ≤ 2 KB).
- El resumen «Talla: S · M · L» de debajo se oculta cuando hay selector.

### O-3 Fotos por valor de opción

- **`images:import`** (`lib/image-files.ts`, `import-images.ts`):
  - `handle--valor_XX.jpg`: el valor de `opcion_fotos` en minúsculas, sin tildes y con guiones (`valueSlug`: «Rayas Azules» → `rayas-azules`).
  - Se sube como foto del producto, detrás de las generales, y se asocia a **todas** las variantes con ese valor (`batchImageVariantsWorkflow`, Medusa ≥ 2.11.2).
  - Idempotente: solo añade las asociaciones que faltan. **Medusa 2.21.2 no evita duplicados**: probado en dev, una segunda pasada duplicaba las 45 filas de `product_variant_product_image`.
  - Un valor que no existe en el producto = aviso.
- **Storefront**:
  - El build pide `*variants.images`. Medusa da a cada variante sus fotos **más** las generales (`assignImagesToVariants`); las de un valor son las de sus variantes que no están en todos los valores.
  - `ProductGallery` pinta un grupo por valor (`data-pa`), con las generales siempre al final. Las del resto de valores llevan `display:none` y `loading="lazy"`, así que no se descargan.
  - La LCP es la primera foto del valor preseleccionado, que es también la imagen de Open Graph.

### O-4 Filtros

- **Listados estáticos** (`lib/facets.ts`):
  - Un valor de opción se ofrece aunque lo tenga **un solo** producto (`MIN_OPTION_PRODUCTS = 1`; los 9 estampados de una marca).
  - El grupo necesita **≥ 2 valores**: con uno no filtra nada, y así «Formato: Única» de los productos sin variantes no sale.
  - Las etiquetas siguen pidiendo ≥ 2 productos.
- **No filtrable**: `metadata.filtrable = false` (también vale `"false"` o `"no"`, tal como se escribe en el Admin) en la opción global.
  - No sale en los listados ni en `/buscar/`. Para `/buscar/` va en el manifiesto del build `hidden-options.json` (`src/pages/listados/opciones.json.ts` → `dist/server`, no público).
  - El índice de búsqueda no cambia: se sigue encontrando por texto (probado con «Estampado»).
- **Panel de filtros**: cada grupo es un `<details>` **plegado**, salvo los que tienen algo marcado. Con JS, `SearchLive` conserva los que el usuario ha abierto al aplicar en el sitio.

### Datos de prueba

`apps/backend/catalog/prueba-arnes/` (versionado, 88 KB de fotos 600×600; `LEEME.md`), cargado en la BD local:

- `prueba-arnes-estampado`: 3 estampados × 5 tallas, fotos por estampado.
- `prueba-arnes-basico`: 3 colores × 3 tallas, sin fotos por valor.
- Los dos van en la categoría nueva `arneses-perro` (hija de `paseo-perro`).

## 3. Decisiones tomadas

| Decisión                                                               | Motivo                                                                                                                                                | Fuente consultada                                                                                         |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Foto en la **variante**, no en la opción                               | Las opciones son globales: una foto en el valor «Rojo» sería la misma para todos los productos                                                        | `@medusajs/product` 2.21.2 AGENTS.md (opciones globales desde 2.16) y modelo `ProductVariantProductImage` |
| La opción de fotos se fija con `opcion_fotos` en la hoja               | Decisión del usuario (antes que detectarla)                                                                                                           | —                                                                                                         |
| CSS por **posición** y fijo, no por producto                           | 0,7 KB gzip en caché para todas las fichas, frente a 2–3 KB por ficha generados (y sin hashes de CSP). Sin JS funciona igual                          | astro-docs (estilos de componente empaquetados)                                                           |
| La variante la busca el **servidor**                                   | Sin JS no hay forma de mandar el `variant_id` de una combinación de dos radios. Un HTML viejo no puede comprar otra variante                          | astro-docs (Actions `accept: "form"`)                                                                     |
| 2 opciones como máximo en el selector, 20 valores                      | El CSS de 3 opciones crece por combinaciones. Con más, la tabla de siempre                                                                            | —                                                                                                         |
| Guía de tallas **por modelo** (`guia_tallas`), plantilla por categoría | Las tallas cambian por marca y modelo (Arnés A y B de la misma marca); «cómo medir» es común a todos los arneses                                      | Decisión del usuario                                                                                      |
| Plantilla y guía en Content Collections (Markdown en el repo)          | Contenido editorial estable; un cambio = rebuild, como el resto de textos                                                                             | astro-docs (content collections)                                                                          |
| No filtrable con la metadata de la opción en el Admin                  | El Admin 2.21.2 ya edita la metadata de opciones y valores (`product-option-metadata`, `product-option-value-metadata`): no hace falta `opciones.csv` | `@medusajs/dashboard` 2.21.2                                                                              |
| Mínimo 1 producto por valor de opción, pero ≥ 2 valores por grupo      | Lo pidió el usuario; el mínimo de valores evita grupos que no filtran                                                                                 | —                                                                                                         |
| `images:import` filtra las asociaciones ya hechas                      | `batchImageVariantsWorkflow` no deduplica (comprobado en dev)                                                                                         | core-flows 2.21.2 `batch-image-variants`                                                                  |
| Aviso nuevo `variant`                                                  | «Revisa la cantidad» no explicaba una combinación inexistente                                                                                         | —                                                                                                         |

## 4. Cómo usarlo

Para crear un producto con selector (p. ej. un arnés de 9 estampados × 5 tallas):

1. En `productos.csv`, una fila por variante con `opcion:Estampado` y `opcion:Talla`; en la primera fila, `opcion_fotos = Estampado` y `guia_tallas = <marca>-<modelo>`.
2. Fotos: `handle_01.jpg` (generales) y `handle--<estampado>_01.jpg`, `_02`… por estampado.
3. Guía: `apps/storefront/src/content/guias/<marca>-<modelo>.md` (tabla en Markdown). Plantilla común: `plantillas/arnes.md` (lista `categorias`).
4. Color de una muestra sin foto: Admin → Opciones → Color → valor → Metadata `color = #c0392b`.
5. Quitar una opción de los filtros: Admin → Opciones → (opción) → Metadata `filtrable = false`.
6. Rebuild del storefront.

```bash
pnpm --filter backend catalog:import <carpeta> dry-run && pnpm --filter backend catalog:import <carpeta>
pnpm --filter backend images:import <carpeta>/fotos [dry-run]
# Si cambia pickerCss() en lib/variant-picker.ts:
PICKER_CSS=write pnpm --filter storefront test
```

## 5. Cómo testear esta fase

```bash
pnpm --filter backend catalog:import catalog/prueba-arnes
pnpm --filter backend images:import catalog/prueba-arnes/fotos   # 2.ª vez: «0 asociaciones nuevas»
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test   # storefront 255, backend 107, emails 20
STOREFRONT_DATA=fixtures pnpm build && pnpm --filter storefront check:budget   # CartClient 1964 B
pnpm --filter backend test:integration:http                      # 56/56
pnpm --filter storefront build && pnpm --filter storefront test:e2e   # 213 (11 omitidos)
```

- `e2e/variantes.spec.ts`, con y sin JS: fotos del estampado, tallas agotadas tachadas, Añadir ↔ Agotado, la combinación correcta en el carrito, guía en el panel y aviso `variant`.
- `e2e/buscar.spec.ts`: grupos plegados y abiertos los que tienen algo marcado.
- A mano: `/producto/prueba-arnes-estampado/` (Rayas → M y L tachadas; Rayas + M → «Agotado»), `/producto/prueba-arnes-basico/` (guía Modelo B, «Cómo medir»), `/categoria/arneses-perro/` → filtros Estampado, Color y Talla plegados.

**Medidas** (Lighthouse móvil, build real con proxy brotli, mediana de 3):

| Ficha                                        | Rend. | A11y | BP  | LCP    | CLS | Peso   |
| -------------------------------------------- | ----- | ---- | --- | ------ | --- | ------ |
| `prueba-arnes-estampado` (selector + fotos)  | 99    | 100  | 96  | 1,96 s | 0   | 162 KB |
| `mock-collar-plus-012` (selector, sin fotos) | 97    | 100  | 96  | 2,64 s | 0   | 322 KB |
| `mock-champu-plus-020` (tabla, referencia)   | 96    | 100  | 96  | 2,71 s | 0   | 330 KB |

El LCP de las fichas mock (~2,7 s) viene de las fotos de picsum (2400×1600) y es igual con tabla que con selector. Es el pendiente de LCP de la fase 13.

## 6. Criterio de salida

- [x] Un producto con 2 opciones se elige con dos grupos de muestras, con y sin JS, y añade la variante correcta.
- [x] Las fotos de la galería siguen al valor elegido de la opción de fotos; las ocultas no se descargan.
- [x] Guía de tallas por modelo y plantilla común por categoría, sin JS.
- [x] Opciones filtrables con un solo producto; opción marcada `filtrable = false` fuera de los filtros; grupos plegados.
- [x] 0 KB de JS nuevo (CartClient 1964 B ≤ 2 KB); batería completa en verde.

## 7. Pendientes / riesgos

- **Textos provisionales** de la plantilla `arnes` y guías de prueba: la tienda escribe los reales (y borra `marca-*-arnes-*.md` y el esquema de prueba cuando quite los productos de prueba).
- Las fotos del Markdown salen como `<img>` WebP (no `<Picture>` AVIF): suficiente para un esquema que se abre poco. Si hiciera falta AVIF, un campo de imagen en el frontmatter.
- **3 opciones** (p. ej. estampado × talla × largo): de momento, tabla. Si hace falta, se estudia aparte.
- Con más de 20 valores en una opción, la ficha vuelve a la tabla: si algún producto real los tiene, subir `MAX_VALUES` (el test vigila que el CSS siga ≤ 1 KB gzip).
- `e2e/correas.spec.ts` ahora entra por `/categoria/correas-perro/`: en `paseo-perro` la página 1 cambiaba con los arneses de prueba.
- Productos de prueba en la BD local (`prueba-arnes-*`): no cargarlos en el VPS.
