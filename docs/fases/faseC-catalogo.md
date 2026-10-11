# Fase C — Importador de catálogo (CSV + `catalog:import`)

> **Estado:** ✅ completada (11-oct-2026)
> **Rama/PR:** `feat/importador-catalogo` · PR #…
> **Anterior:** [Fase 10](./fase10.md) · **Siguiente:** fase 11 (producción en Hetzner, [ESTADO §6.5](../ESTADO.md))

## 1. Objetivos

- [x] Plantillas CSV (categorías con jerarquía + productos con variantes) con las instrucciones dentro.
- [x] Script `catalog:import <carpeta> [dry-run]`: primero categorías y después productos. Valida todo antes de escribir, es idempotente y sirve en dev y en producción.
- [x] Fotos: se mantiene `images:import` (carpeta local → bucket), por producto (`handle_XX.jpg`).
- [x] Componentes analíticos (pienso), contenido neto por variante y **venta a granel** (inventario en gramos, mínimo por pedido validado en el carrito). Listo en Medusa para cuando el storefront lo muestre.
- [x] Tests unitarios e integración; prueba real en dev.

## 2. Qué se ha hecho

- **Plantillas** en `apps/backend/catalog/plantilla/`:
  - `categorias.csv` y `productos.csv`, con ejemplos y un resumen de las reglas en filas de comentario `#`;
  - `LEEME.md`, la guía completa.

  `apps/backend/catalog/*` está en `.gitignore` salvo `plantilla/`: las cargas reales (datos del negocio) no se suben.

- **Lógica pura** (con tests):
  - `src/scripts/lib/csv.ts`: lector CSV RFC 4180 sin dependencias. Separador `,`/`;` autodetectado en la cabecera, BOM, CRLF, saltos de línea entre comillas, filas `#` ignoradas y UTF-8 estricto.
  - `src/scripts/lib/catalog-sheet.ts`: lectura y validación de las hojas (formato de cada celda, herencia, combinaciones de opciones…).
  - `src/scripts/lib/catalog-plan.ts`: cruza las hojas con Medusa y decide qué crear, actualizar o dejar. También construye las entradas de los workflows.
- **Script** `src/scripts/import-catalog.ts` (`pnpm --filter backend catalog:import`). Pasos:
  1. Lee las hojas.
  2. Lee una instantánea de Medusa y planifica. Si hay errores, para sin escribir nada.
  3. Categorías por niveles (padres antes que hijas).
  4. Opciones globales, valores y etiquetas.
  5. Productos nuevos en lotes de 20, más su stock.
  6. Productos existentes (datos, valores enlazados, variantes; 4 en paralelo).
  7. Ofertas.

  Antes del paso 5, los artículos de inventario en gramos de las variantes a granel nuevas.

- **Granel en el carrito**: `src/workflows/hooks/granel-minimo.ts` (hooks `validate` de `addToCartWorkflow`, `updateLineItemInCartWorkflow` y `createCartWorkflow`) con la regla pura en `src/lib/granel.ts`.
- **Plantilla** con ejemplos de la tienda: collar (opciones y precios por talla), pienso (analíticos y `neto_g`), alas de pollo a granel y taza (`neto_ml`).
- **Errores más claros**: un solo error por celda; si en `padre` o `categorias` se escribe el nombre en vez del handle, propone el handle («¿Querías decir «alimentacion-perro»…?»); aviso de minúscula en `nombre`/`descripcion` de categoría.
- Tests:
  - `src/scripts/__tests__/catalog-import.unit.spec.ts`: 22 tests.
  - `integration-tests/http/catalogo.spec.ts`: 4 tests (dry-run; carga + recarga + cambios; granel con carrito por la Store API; hoja con errores).

## 3. Decisiones tomadas

| Decisión                                                                                                                                                                 | Motivo                                                                                                                                                                                                | Fuente consultada                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hoja propia, no el importador CSV del Admin                                                                                                                              | El del Admin pide IDs internos y no carga stock, IVA ni opciones globales.                                                                                                                            | Código de `normalize-products` / `import-products-as-chunks` (core-flows 2.21.2)                                                                                        |
| CSV UTF-8 sin dependencias (no `.xlsx`)                                                                                                                                  | Decisión del usuario. Excel en español guarda con `;`: se detecta solo.                                                                                                                               | —                                                                                                                                                                       |
| Una fila por variante; los datos del producto solo en su primera fila                                                                                                    | Decisión del usuario (§6.6). Un dato de producto distinto en otra fila es un error.                                                                                                                   | —                                                                                                                                                                       |
| **Herencia** de `precio`, `precio_oferta`, peso y medidas desde la fila de arriba **del mismo producto**                                                                 | Petición del usuario (todas las S a un precio, las L a otro). La oferta va con su precio: una fila con precio propio y oferta vacía no la hereda.                                                     | —                                                                                                                                                                       |
| Opciones con prefijo `opcion:` en la cabecera (`opcion:Talla`…), **globales** (`is_exclusive: false`)                                                                    | A1 del usuario. Habrá muchas opciones; las globales hacen que las facetas sumen bien (D2b de la fase 7).                                                                                              | context7 `/medusajs/medusa` (product options), tipos `CreateProductOptionDTO` 2.21.2                                                                                    |
| Valores de opción y etiquetas comparados sin mayúsculas ni tildes, con la grafía que ya hay en Medusa                                                                    | Evita duplicados («azul»/«Azul»). El dry-run lista los valores nuevos para cazar erratas.                                                                                                             | —                                                                                                                                                                       |
| Producto sin opciones → opción **exclusiva** «Formato: Única»                                                                                                            | Medusa 2.21 exige al menos una opción («Product options are not provided», `validate-product-input`). Es lo mismo que el catálogo mock y el storefront ya oculta «Única».                             | Error real en el test de integración + `create-products` de core-flows 2.21.2                                                                                           |
| Medusa ≥ 2.16: cada producto enlaza **su subconjunto** de valores de la opción global                                                                                    | Al crear: `options: [{ id, value_ids }]`. Para valores nuevos de un producto existente: `setProductProductOptionsWorkflow.update.add`.                                                                | `product-module-service.js` 2.21.2 (`updateProductOptionValuesOnProduct_`)                                                                                              |
| Upsert por `handle` (categoría, producto) y `sku` (variante); lo que no está en la hoja se ignora                                                                        | Respuesta 8 del usuario.                                                                                                                                                                              | —                                                                                                                                                                       |
| Stock solo al crear la variante                                                                                                                                          | Respuesta 8 del usuario: recargar no debe pisar lo vendido. La reposición masiva será otro script.                                                                                                    | —                                                                                                                                                                       |
| Celda vacía = no tocar · `-` = borrar; etiquetas y categorías con valor **sustituyen**                                                                                   | A4 del usuario.                                                                                                                                                                                       | —                                                                                                                                                                       |
| Precios al actualizar: se mandan **todos** los precios de la variante con su `id` y solo cambia el EUR base                                                              | Medusa borra los precios no mencionados (también los de reglas).                                                                                                                                      | context7 (batchVariants: «existing unmentioned prices are removed») + `updatePriceSets_` de pricing 2.21.2                                                              |
| Ofertas en una Price List `sale` propia, «Catálogo — ofertas»; la hoja manda en sus SKU                                                                                  | A4 del usuario. Las listas del Admin no se tocan. Mismo mecanismo que `seed-mock-ofertas` (precio tachado = precio base).                                                                             | context7 (Price Lists `sale`), `batchPriceListPricesWorkflow` 2.21.2                                                                                                    |
| Un producto existente no cambia de opciones desde la hoja (error)                                                                                                        | Quitar o añadir una opción a un producto con variantes es delicado; se hace en el Admin. Sí se añaden variantes y valores.                                                                            | —                                                                                                                                                                       |
| Más celdas que columnas = error                                                                                                                                          | Un `9,95` sin comillas en un CSV con comas se partía en dos celdas en silencio.                                                                                                                       | Test unitario                                                                                                                                                           |
| `marca` en `metadata.marca`; `material`, `ean`, peso y medidas en sus campos de Medusa                                                                                   | El peso y las medidas son por variante (como el precio).                                                                                                                                              | `UpdateProductVariantDTO` 2.21.2                                                                                                                                        |
| Solo workflows oficiales, nada de SQL                                                                                                                                    | El índice de Meilisearch se actualiza solo (comprobado: `option_values` con «Proteína:…»).                                                                                                            | AGENTS §4                                                                                                                                                               |
| Analíticos en `metadata` del producto con claves planas (`proteina_pct`, `grasa_pct`, `fibra_pct`, `cenizas_pct`, `humedad_pct`) + `analitico:<Nombre>` de texto         | Planas para poder indexarlas en Meilisearch como `filterable`. La materia seca (`x / (100 − humedad)`) se calcula al indexar, no se guarda. Aviso si suman > 100 o falta la humedad.                  | metadata de Medusa: fusión superficial, `""` borra la clave (`mergeMetadata`, utils 2.21.2)                                                                             |
| Contenido neto `neto_g` / `neto_ml` en `metadata` de la variante; `peso_g` sigue siendo el de envío                                                                      | Precio por unidad de medida (RD 3423/2000) en una fase del storefront. Peso de envío ≠ contenido.                                                                                                     | —                                                                                                                                                                       |
| **Granel**: una variante cuya unidad de venta es un **paso** de `paso_g`; inventario en **gramos** con un artículo propio y `required_quantity = paso_g` (inventory kit) | Petición del usuario: venta al peso en pasos (1/5/25/50 g), no al gramo, por la merma. La disponibilidad sale de Medusa (`floor(stock_g / paso)`) y la reserva descuenta gramos, sin código propio.   | `computeVariantAvailability` y `prepare-confirm-inventory-input` (core-flows 2.21.2: dividen y multiplican por `required_quantity`); `CreateProductVariantInventoryKit` |
| Precio de un paso = `precio_kg × paso_g / 1000` en céntimos **exactos**; si no, error con alternativas                                                                   | Medusa guarda el precio por unidad y Stripe redondea (`getSmallestUnit`, `Math.round`): un 9,95 céntimos daría totales que no cuadran con el €/kg anunciado.                                          | `payment-stripe` 2.21.2                                                                                                                                                 |
| `paso_g` y el paso de normal↔granel no se cambian desde la hoja (error)                                                                                                  | Cambiaría el significado del stock (gramos por unidad) y de los precios. `min_g` y precios sí.                                                                                                        | —                                                                                                                                                                       |
| Mínimo `min_g` en el **backend** (hook `validate`)                                                                                                                       | Lo valida Medusa, no el storefront: vale para cualquier cliente de la API. Suma lo que ya hay en el carrito de esa variante (añadir la fusiona con su línea); cantidad 0 = quitar, siempre permitido. | context7 `/medusajs/medusa` (workflow hooks: `addToCartWorkflow.hooks.validate`) + `add-to-cart.js` / `update-line-item-in-cart.js` 2.21.2                              |
| Subcategorías en el storefront: **otra fase**                                                                                                                            | A2 del usuario. Hoy `getCategories()` solo genera las categorías principales.                                                                                                                         | —                                                                                                                                                                       |

## 4. Cómo usarlo

Guía completa para quien rellena la hoja: [`apps/backend/catalog/plantilla/LEEME.md`](../../apps/backend/catalog/plantilla/LEEME.md).

```bash
cp -r apps/backend/catalog/plantilla apps/backend/catalog/mi-carga   # y rellenar los CSV
pnpm --filter backend catalog:import catalog/mi-carga dry-run          # informe, no escribe
pnpm --filter backend catalog:import catalog/mi-carga
pnpm --filter backend images:import catalog/mi-carga/fotos [dry-run]   # handle_01.jpg…
```

Producción (dentro del contenedor; scripts compilados en `./src/scripts/*.js`):

```bash
C="docker compose --env-file docker/.env.prod -f docker/compose.prod.yml"
$C cp apps/backend/catalog/mi-carga backend-server:/tmp/catalogo
$C exec -T backend-server ./node_modules/.bin/medusa exec ./src/scripts/import-catalog.js /tmp/catalogo dry-run
$C exec -T backend-server ./node_modules/.bin/medusa exec ./src/scripts/import-catalog.js /tmp/catalogo
$C exec -T backend-server ./node_modules/.bin/medusa exec ./src/scripts/import-images.js /tmp/catalogo/fotos
```

## 5. Cómo testear esta fase

```bash
pnpm --filter backend test                                        # unitarios (incluye catalog-import: 22)
pnpm --filter backend exec jest --runInBand --forceExit integration-tests/http/catalogo.spec.ts \
  # con TEST_TYPE=integration:http NODE_OPTIONS=--experimental-vm-modules → 4 passed
pnpm --filter backend test:integration:http                       # todo el backend

# Prueba real en dev (la plantilla cambiaría «libros» a inactiva: copia solo las subcategorías)
cd apps/backend && cp -r catalog/plantilla catalog/prueba-dev
grep -E '^"#|^handle|^camisetas|^sudaderas|^suplementos' catalog/plantilla/categorias.csv > catalog/prueba-dev/categorias.csv
pnpm catalog:import catalog/prueba-dev dry-run   # → 3 categorías nuevas; opciones Proteína y Tamaño; 3 productos (8 variantes); 3 ofertas
pnpm catalog:import catalog/prueba-dev           # → ~4 s
pnpm catalog:import catalog/prueba-dev           # → 0 nuevos, 3 sin cambios (idempotente)
```

Resultado en dev, el 11-oct-2026:

- `GET /store/products?handle=camiseta-basica`: S a 19,95 € y L a 21,95 € (con oferta sobre 24,95, `price_list_type: sale`), stock 10/8/5/0.
- `POST /store/search` «proteina whey»: indexado con `Proteína:Chocolate|Vainilla` y `Tamaño:1 kg|2 kg`.
- Los 3 productos de la plantilla siguen en la BD local (handles `camiseta-basica`, `proteina-whey`, `taza-logo`).

## 6. Criterio de salida

- [x] Plantillas con instrucciones dentro y `LEEME.md`.
- [x] Validación completa antes de escribir; informe por fila y columna; con errores no se escribe nada (test).
- [x] Idempotente: la segunda carga no cambia nada, ni siquiera el stock vendido (test).
- [x] Lo que no está en la hoja se ignora (test: variante quitada de la hoja sigue en Medusa).
- [x] Herencia de precio y oferta (test con la plantilla).
- [x] `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build` en verde.

## 7. Pendientes / riesgos

- **Storefront: granel** (fase posterior). Medusa ya lo tiene todo (precio por paso, stock en gramos, `metadata.paso_g`/`min_g`, mínimo validado en el carrito). Falta:
  - ficha con selector de gramos (múltiplos del paso desde el mínimo) que envíe `quantity = gramos / paso`;
  - precio por kilo y total en gramos en una línea («250 g · 5,00 €») en el carrito, el checkout y los emails;
  - `inventory_quantity × paso` para mostrar el stock en gramos.

  Hasta entonces, productos a granel en `borrador` (la plantilla ya lo hace).

- **Storefront: analíticos y precio por kilo/litro** (fase posterior): tabla de componentes en la ficha; filtros por % sobre materia seca (calculada al indexar en `src/search/product.ts`); €/kg con `neto_g` o €/l con `neto_ml`.

- **Storefront: subcategorías** (página `/categorias/<hija>/`, productos de las hijas en el padre, migas, menú). Sin esto, un producto que solo está en una subcategoría no sale en los listados de categoría (sí en `/productos/` y en la búsqueda).
- **Reposición de stock masiva** (`stock:import`): script aparte, más adelante.
- **Productos mock en producción**: tarea aparte (limpieza antes de abrir).
- Fotos por variante (`batchVariantImagesWorkflow`, Medusa ≥ 2.11.2): posibles, pero el storefront no las enseña.
- Cargas muy grandes (> 1000 productos): unos 20 productos por lote. Si en producción va lento, subir `PRODUCT_BATCH`. El índice de Meilisearch se actualiza en el worker.
- El importador no borra nada (ni categorías, ni productos, ni variantes). Borrar se hace en el Admin.
