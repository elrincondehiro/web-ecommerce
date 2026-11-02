# Fase FO — Familias de opciones (filtros agrupados)

> **Estado:** ✅ — plan aprobado el 1-nov-2026; FO-1 a FO-7 hechas (cerrada el 2-nov-2026)
> **Rama/PR:** `feat/familias-opciones` · PR #…
> **Anterior:** [Fase H — home](./faseH-home.md) · **Siguiente:** …

## 0. Problema

Cada marca llama a sus colores a su manera («Huckleberry», «Sea Foam», «Rojo intenso»…) y algunas dan las tallas en centímetros. Con los nombres originales (que se quieren conservar: es como los conoce y busca la gente), el filtro «Color» de categorías y `/buscar/` se llena de valores con uno o dos productos y filtrar deja de servir.

**Solución:** cualquier opción global puede tener **familias**; cada valor pertenece a **una o varias**. Si una opción tiene familias, los filtros enseñan las familias y no los valores. La ficha y la búsqueda por texto siguen con los nombres originales.

## 1. Objetivos

- [x] General: sirve para cualquier opción (Color, Talla, Sabor…), no solo colores.
- [x] Un valor puede pertenecer a varias familias («Sea Foam» → verde y azul).
- [x] 12 familias de color predefinidas: negro, gris, blanco, marrón y beige, rojo, rosa, naranja, amarillo, verde, azul, morado, multicolor.
- [x] Se rellena desde la **hoja** (`familias.csv`, `catalog:import`) **o** desde un **widget del Admin** en la opción.
- [x] Filtros de categorías y `/buscar/` por familias (con punto de color si la familia lo tiene), con y sin JS.
- [x] Al llegar a la ficha desde un filtro, queda **preseleccionada** la primera variante con stock que cumple el filtro (bundle `PickerLive`, excepción de JS aprobada el 1-nov-2026).
- [x] La búsqueda por texto sigue encontrando los nombres originales.
- [x] Reindexado automático al cambiar familias (sin pasos manuales).

## 2. Modelo de datos

Todo en **metadata de Medusa** (sin módulo ni migraciones nuevas). Las opciones de Medusa 2.22 son globales y compartidas entre productos.

**Opción** (`product_option.metadata.familias`): lista ordenada de familias.

```json
[
  { "id": "azul", "nombre": "Azul", "color": "#2f6fd1" },
  { "id": "verde", "nombre": "Verde", "color": "#3a9a5b" }
]
```

- `id`: `a-z0-9-` (va en la URL del filtro: `?familia=Color:azul`).
- `color` opcional (hex): el punto del filtro. Las tallas no lo llevan.
- Orden de la lista = orden en el filtro.
- La plantilla de las 12 familias de color vive en el código (`lib/option-families.ts`); el widget y la hoja la usan para rellenar una opción nueva de un clic, pero lo que manda es la metadata.

**Valor** (`product_option_value.metadata.familias`): ids de sus familias, `["verde", "azul"]`.

- Junto al `color` (hex de la muestra) que ya existe (Fase O).
- Un valor sin familias en una opción que las tiene **no sale en el filtro** (aviso en `dry-run` y en el widget).

**Opción sin familias**: el filtro sigue con sus valores (como hoy). `metadata.filtrable = false` sigue funcionando igual.

## 3. Plan por partes

### FO-1 · Núcleo (funciones puras, tests) ✅

Hecho: `lib/option-families.ts` (idéntico en backend y storefront; un test del storefront falla si difieren): `parseOptionFamilies` (valida id `a-z0-9-`, nombre ≤ 40, color `#rrggbb`, sin repetidas, ≤ 24; devuelve los problemas para el dry-run y el widget), `valueFamilies` (≤ 4 por valor, en el orden de la opción; acepta lista o `a|b`), `parseFamilyList`, `familyKey`/`splitFamilyKey` («Título:id»), `productFamilyKeys` (claves del índice y de los filtros del build), `valuesWithoutFamily` (avisos) y `COLOR_FAMILIES` (las 12). Tests: storefront 15, backend 3.

Plan original:

- `apps/backend/src/lib/option-families.ts` y su gemelo `apps/storefront/src/lib/option-families.ts` (mismas reglas; el storefront no importa del backend): leer y validar `familias` de opción y valor, plantilla de color, `familiesOf(producto)` → `["Color:azul", "Talla:m"]`.
- Tests unitarios en los dos.

### FO-2 · Hoja `familias.csv` (`catalog:import`) ✅

Hecho (2-nov-2026): una sola hoja (decisión del usuario) con columnas `opcion, familia, nombre, color, valor, familias, color_muestra`; filas que **definen** (`familia`, o `plantilla` = las 12) y que **asignan** (`valor`).

- `scripts/lib/families-sheet.ts` (lectura y validación) y `scripts/lib/families-plan.ts` (plan contra Medusa, idempotente, mezcla la metadata y conserva el resto de claves; `withPendingOptions` para validar en el dry-run los valores que la misma carga va a crear).
- `import-catalog.ts`: lee `familias.csv` si está, informa en el dry-run (familias, valores que cambian, errores y avisos) y escribe al final (paso 7, tras crear los productos, recalculando el plan) con los **workflows oficiales** (decisión del usuario): `updateProductOptionsWorkflow` y `updateProductOptionValuesWorkflow`, con su compensación. Sustituyen la metadata entera: el plan parte de la actual (comprobado en `@medusajs/core-flows` 2.22.1). Emiten `product-option.updated` y `product-option-value.updated` (comprobado en el test HTTP), base del reindexado de FO-3.
- Plantilla `catalog/plantilla/familias.csv` y LEEME §Familias.
- Tests: unitarios de hoja y plan (10), HTTP en `catalogo.spec.ts` (metadata, `filtrable` conservado, eventos, segunda carga sin escrituras). Probado en el entorno real (dry-run con un valor inexistente → error; carga; repetición → 0 cambios).

Plan original:

- Fichero opcional junto a `productos.csv`, dos tipos de fila:
  - **definición**: `opcion=Color, familia=azul, nombre=Azul, color=#2f6fd1` (o `plantilla=colores` para cargar las 12);
  - **asignación**: `opcion=Color, valor=Sea Foam, familias=verde|azul, color_muestra=#8fd3c1`.
- `dry-run` informa de cambios y avisa de: familias desconocidas, valores de una opción con familias sin asignar, opciones exclusivas (`is_exclusive`, se agrupan producto a producto).
- ~~Workflow propio~~ → workflows oficiales `updateProductOptionsWorkflow` / `updateProductOptionValuesWorkflow` (decisión del 2-nov-2026). El widget (FO-5) los encadenará.
- Plantilla y documentación en `catalog/plantilla/` (LEEME §Familias).

### FO-3 · Índice de búsqueda ✅

Hecho (2-nov-2026):

- `src/search/product.ts`: campo `option_families` (keyword, array, filterable, facetable, no buscable ni recuperable) = `productFamilyKeys(options)`; la fuente pide `options.metadata` y `options.values.metadata`.
- Evento `product-option-value.updated` en la lista del índice y su caso en `resolveProductIds`: `product_option_value → variants.product_id` (solo los productos que usan ese valor; comprobado en el modelo de `@medusajs/product` 2.22.1).
- `configureStoreSearch` no cambia: ya permite el índice `product` entero, así que el campo nuevo se puede filtrar y pedir como faceta desde `POST /store/search`.
- `db:migrate` en las **dos** infras (sin `--execute-all-search`): el plan de `@medusajs/search` 2.22.1 fue `migrate` (versión nueva, sin `drop`); al arrancar, el backend llena la versión nueva y la activa. Mocks: `product_v3` → `product_v4` (1068 documentos); real: `product_v1` → `product_v2`. La versión anterior la limpia el propio módulo en el siguiente `db:migrate`.
- Probado: en el real, `familias.csv` (Mauve → rosa|morado) se ve en el índice en segundos sin reiniciar nada; `POST /store/search` con `filters: { option_families: { $in: ["Color:rosa"] } }` devuelve solo el arnés que usa Mauve, y la faceta da los conteos.
- Test HTTP en `search.spec.ts`: cambiar solo la familia de un valor (workflow oficial) reindexa el producto; **sin** el evento nuevo, falla (comprobado). Nota del test: cada producto del `beforeEach` crea su propia opción «Color», así que se usa la del producto publicado (con `title` a secas salía a veces la del borrador y el test fallaba de forma intermitente).

Plan original:

- Campo nuevo `option_families` (keyword, array, filterable, facetable, no searchable) en `src/search/product.ts`, calculado de la metadata.
- Evento `product-option-value.updated` en la lista del índice, con su caso en `resolveProductIds` (fuente: context7 `/medusajs/medusa`, product-index-examples: `"product-option-value.updated"`). `product-option.updated` ya está.
- `configureStoreSearch` (middlewares): permitir filtrar y pedir facetas de `option_families`.
- `medusa db:migrate` para la versión nueva del índice (revisando antes qué índices toca, AGENTS §4).

### FO-4 · Filtros del storefront (sin JS) ✅

Hecho (2-nov-2026; diseño aprobado: parámetro `familia=` y punto de color):

- **URL** (`lib/search.ts`): `familia=Título:id` (repetible; OR dentro de la opción y AND entre opciones, como `opcion`). `?opcion=` sigue para las opciones sin familias y para URLs antiguas (filtra el valor exacto y sale como chip para quitarlo).
- **`/buscar/`**: filtro `option_families: { $in }` por grupo, faceta `option_families` y el mismo conteo por grupo que `option_values` (consulta [1] con todo y una por grupo marcado sin el suyo), ahora para los dos campos. Nombres, colores y orden de las familias: manifiesto del build `option-families.json` (`pages/listados/familias.json.ts`, `privateBuildManifests`), leído en `lib/search-server.ts`. `SearchLive` no cambia (reenvía la query de cualquier enlace a /buscar/).
- **Listados del build** (`lib/facets.ts`): `familyCatalog` (familias de las opciones filtrables) y, para las opciones con familias, un grupo `key: "familia"` con las familias que tienen productos, en el orden de la opción; ≥ 2 familias para ofrecerlo (como los valores). `facetsFromSearch` hace lo mismo con los recuentos del motor y no ofrece los valores de esas opciones.
- **Punto de color** (`lib/family-swatches.ts`, `.fam-dot` en `global.css`): clase `fam-c-<hex>` (la CSP no deja `style=`). Las 11 de la plantilla, fijas en `global.css` (/buscar/ cambia el panel sin recargar y un `<style>` del fragmento no se aplicaría); los colores propios, con `HeadStyle` en las páginas de listado. Sin color propio (Multicolor): degradado. Familias sin colores (tallas): sin punto. Coste: ~530 B de CSS sin comprimir en cada página (~260 B gzip).
- **Chips**: «Color: Azul» (nombre de la familia).
- **Datos de prueba**: `catalog/prueba-arnes/familias.csv` agrupa la opción «Color» de los mocks (36 valores) en las 12 familias.
- **Tests**: unitarios de URL/consultas/recuentos/chips (search), de facetas del build y de /buscar/ (facets) y de los puntos (family-swatches); e2e `familias.spec.ts` (categoría y /buscar/, con y sin JS; texto que sigue encontrando el nombre de marca; URL antigua) y axe en /buscar/ filtrado; `buscar.spec.ts` adaptado (Color ahora va por familias). Suite e2e: 266 passed.

Plan original:

- `lib/facets.ts`: una opción con familias genera un grupo «Color» con las familias (conteo de productos, ≥ 1 producto) en vez de los valores; en el build (categorías) y en `/buscar/` (facetas de Meilisearch).
- URL: `?familia=Color:azul` (repetible, OR dentro de la misma opción y AND entre opciones, como los filtros actuales). `?opcion=` sigue igual para las opciones sin familias.
- Punto de color en el chip/checkbox de la familia (CSS por clase y `HeadStyle`, sin `style=` por la CSP).
- Chips de filtros activos y `SearchLive` (híbrido de la fase 7-1) con el parámetro nuevo.

### FO-5 · Widget del Admin (`product_option.details.after`) ✅

Hecho (2-nov-2026; boceto aprobado: muestra en el widget y orden con flechas):

- Widget `src/admin/widgets/option-families.tsx` en la ficha de una opción (Admin → Options → la opción, ruta `/app/product-options/:id`): familias (nombre; id que sigue al nombre hasta tocarlo; color del filtro con selector nativo + `#rrggbb`; ▲▼ para ordenar; quitar; «Cargar las 12 de color») y una tabla con todos los valores (`GET /admin/product-options/:id/values`, con `metadata`): una casilla por familia (≤ 4 por valor; el resto se desactivan), **«Muestra en la ficha»** (`metadata.color`, Fase O) y «Solo sin familia». Guardar / Descartar. En opciones exclusivas, solo una nota.
- Ruta `POST /admin/option-families/:id` (zod en middlewares): comprueba que los valores son de la opción, calcula el plan con `planFamilies` (el mismo de `familias.csv`) y escribe con el workflow `update-option-families` (`src/workflows/option-families`): opción y valores en una transacción con compensación (restaura la metadata anterior) y los mismos eventos `product-option.updated` / `product-option-value.updated` (reindexado automático de /buscar/).
- **Arreglo de FO-2** encontrado aquí: Medusa **fusiona** la metadata al actualizar (`mergeMetadata` del servicio interno, `@medusajs/utils` 2.22.1) y solo borra una clave enviada como `""`. Quitar familias o color (`-` en la hoja, «quitar» en el widget) no borraba nada; ahora el plan manda `""`. Test HTTP añadido en `catalogo.spec.ts` y en `familias.spec.ts`.
- Tests: HTTP `familias.spec.ts` (guardar en el orden de la opción y conservar el resto, idempotente, quitar, validaciones, valor de otra opción, 404, 401). Probado en el navegador con un admin temporal (borrado): carga 12 familias × 36 valores, reordenar (▲) y quitar una casilla, guardar, recargar → orden guardado y aviso «1 sin familia»; la opción se dejó como estaba.
- Nota de pruebas: el Admin compilado (`medusa start`) fija la URL del backend en el build y la cookie de sesión es `Secure` con `NODE_ENV=production`; para probar widgets en otro puerto, `medusa develop` con `PORT`/`MEDUSA_BACKEND_URL`/`HMR_PORT` propios.

Plan original:

- Zona comprobada en `@medusajs/admin-shared` 2.22.1.
- Arriba: familias de la opción (nombre, color, orden; añadir, quitar, «cargar las 12 de color»).
- Debajo: **tabla con todos los valores** y una casilla por familia, más el color de la muestra: se rellena una opción entera de una vez.
- Guarda con una ruta propia `POST /admin/option-families/:id` (validación zod en middlewares) que llama al mismo workflow de FO-2.
- Aviso de valores sin familia.

### FO-6 · Preselección al venir del filtro (`PickerLive`) ✅

Hecho (2-nov-2026):

- `lib/variant-picker.ts`: cada valor lleva `families` («Color:azul», de `valueFamilies` en el orden de la opción) y `pickerHasFamilies()`. `VariantPicker.astro` pone `data-fam="Color:verde|Color:azul"` en los radios y `<PickerLive />` solo si algún valor tiene familias.
- `PickerLive.astro` (424 B gzip): lee `familia` de la URL; en cada opción filtrada admite los valores de alguna de esas familias (OR) y en las demás cualquiera; recorre las combinaciones y marca la primera **con stock según el HTML** (`data-vstock`; si LiveSync lo cambia después, no se vuelve a elegir) o, si no hay ninguna con stock, la primera que exista; dispara `change` (♡ de la ficha). Sin coincidencias, nada.
- Enlace: `ProductCard` acepta `families` y `SearchResults` pasa `params.familia` → `/producto/x/?familia=Color%3Aazul`. Solo en `/buscar/` (los listados estáticos no filtran: el panel lleva a `/buscar/`). La ficha es la misma página estática (la query no cambia HTML ni caché; las Speculation Rules `/producto/*` también la cubren).
- `astro.config.mjs`: `PickerLive` en `assetsInlineLimit` (como bundle en `/_astro/`, no inline: la CSP y el límite de JS inline). `check:budget`: bundle «selector» exigido con `<input … data-fam=` y prohibido sin él (139 fichas en el build de los mocks).
- e2e (`familias.spec.ts`): enlace de las tarjetas con y sin filtro; con JS marca Rojo S, se salta una combinación agotada (HTML modificado con `page.route`) y con una familia que no tiene, la de por defecto; sin JS, la de por defecto.

Plan original:

- Los enlaces de las tarjetas, en un listado filtrado por familias, llevan el filtro en la URL de la ficha (`/producto/x/?familia=Color:azul`). Es la misma página estática (la query no cambia el HTML ni la caché de la página).
- `PickerLive` (bundle nuevo, ≤ 1 KB gzip, objetivo ~200 B, sin imports, en `/_astro/`) **solo en las fichas con selector**: lee `familia` de la URL y marca la primera combinación **con stock** cuyos valores pertenecen a esas familias (atributo `data-fam` en los radios, generado en el build); dispara `change` para que el resto (fotos, precio, Añadir/Agotado: CSS) siga igual. Sin coincidencia o sin JS: la variante por defecto, como hoy.
- `check:budget`: exige `PickerLive` en las páginas con `data-picker` y lo prohíbe en las demás; nueva excepción en AGENTS §3.4 (redactada en esta fase).
- Por qué un bundle propio y no CartClient: CartClient está a 2037 de 2048 B y se carga en todas las páginas estáticas; SiteClient es el de todas las páginas; ScrollDrag no tiene relación. Detalle en §3 del análisis (abajo, decisiones).

### FO-7 · Pruebas y documentación ✅

Hecho (2-nov-2026):

- e2e (`familias.spec.ts`, 16 casos en los dos proyectos): filtro por familia en categoría estática y en `/buscar/` con y sin JS (OR dentro de la opción, chip con el nombre, quitarlo), texto con el nombre de marca, URL antigua `?opcion=`, enlaces de las tarjetas con `?familia=`, preselección con JS (también saltando una combinación agotada) y sin JS. HTTP de la ruta del widget (`familias.spec.ts` del backend) y de la hoja (`catalogo.spec.ts`).
- axe (`accesibilidad.spec.ts`): `/buscar/` filtrado por familia y categoría con el panel de familias abierto, claro y oscuro.
- Lighthouse (base `main` contra la rama, mismo catálogo y proxy brotli, móvil, mediana de 3): sin regresión (100/100/100; diferencias de LCP en los dos sentidos = ruido). Lo único que costaba en todas las páginas (190 B de colores de familias en el CSS común) se movió a las páginas con filtros (`HeadStyle`).
- LEEME de la plantilla (§Familias: hoja, Admin y preselección), README §13, ESTADO, AGENTS §3.2 y §3.4.

- e2e: filtro por familia en una categoría y en `/buscar/` (con y sin JS), ficha con preselección (con JS) y sin ella (sin JS), widget del Admin (HTTP de la ruta).
- `e2e/accesibilidad.spec.ts`: listado filtrado.
- LEEME de la plantilla, este documento, README §13, ESTADO, AGENTS §3.4.

## 4. Decisiones

| Decisión                                       | Motivo                                                                                        | Fuente                                                 |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Sistema general (cualquier opción)             | Mismo coste que hacerlo solo para colores; sirve también para tallas en cm                    | —                                                      |
| Metadata de opción y valor (sin módulo propio) | Las opciones son globales en Medusa 2.22; ya se usa `metadata.color` y `filtrable`            | context7 `/medusajs/medusa`                            |
| Varias familias por valor                      | Tonos frontera («Sea Foam», «Teal»)                                                           | Usuario                                                |
| 12 familias de color predefinidas              | Aprobadas por el usuario                                                                      | Usuario                                                |
| Hoja + widget del Admin, mismo workflow        | Una sola lógica de escritura con compensación                                                 | AGENTS §4                                              |
| `product-option-value.updated` en el índice    | Reindexado automático al cambiar la familia de un valor                                       | context7 product-index-examples                        |
| `PickerLive` propio (no CartClient)            | CartClient al 99 % de su límite y en todas las páginas; solo lo pagan las fichas con selector | Medido: CartClient 2037/2048 B, SiteClient 1557/2048 B |

## 5. Cómo testear

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm --filter storefront check:budget
pnpm --filter backend test:integration:http
E2E_BASE_URL=http://localhost:4398 pnpm --filter storefront exec playwright test
pnpm --filter backend catalog:import catalog/<carpeta> dry-run   # con familias.csv
# Datos de prueba de los e2e (catálogo local): familias de «Color» de prueba-arnes
pnpm --filter backend catalog:import catalog/prueba-arnes
# Admin: Options → «Color» → tarjeta «Familias para los filtros de la tienda»
```

## 6. Criterio de salida

- [x] Filtros por familia en categorías y `/buscar/`, con y sin JS.
- [x] Hoja y widget producen el mismo resultado; reindexado automático.
- [x] Preselección con JS; sin JS, ficha normal.
- [x] 0 KB nuevos en páginas sin selector; `PickerLive` ≤ 1 KB gzip.
- [x] Lighthouse móvil sin cambios en ficha y listado; e2e y axe en verde.

## 7. Pendientes / riesgos

- Tallas entre marcas: la familia es orientativa; la talla exacta y la guía siguen en la ficha.
- Opciones exclusivas (`is_exclusive`): se agrupan producto a producto; el `dry-run` avisa.
- Los filtros de categorías se ven tras un rebuild; `/buscar/` en cuanto se reindexa.
