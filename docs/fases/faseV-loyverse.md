# Fase V — Volcado de Loyverse (tienda física) y revisión del catálogo

> **Estado:** ✅ herramientas completadas (22-oct-2026) · la revisión por categorías (V-3) y las cargas siguen, a mano, con estas herramientas
> **Rama/PR:** `feat/migracion-loyverse` · PR #…
> **Anterior:** [Fase G](./faseG-invitados.md) · **Siguiente:** fase de enlace con `catalog:import` (por definir)

El catálogo de la tienda física está en **Loyverse** (TPV), con unos 1000 artículos y 5 años sin limpiar: hay muchos descatalogados, mal categorizados y sin variantes adecuadas. No se quiere volcar todo en la tienda online. Esta fase **descarga** catálogo y tickets, propone qué conservar según las ventas y deja una **hoja de revisión** para decidir a mano. Pasar la selección a las plantillas de `catalog:import` (Fase C) es **otra fase**.

## 1. Objetivos

- [x] **V-1** scripts en `migracion/loyverse/`: `descargar`, `analizar`, `seleccion`, con tests.
- [x] **V-1b** informe de ventas `informe` (HTML con gráficas SVG, sin dependencias).
- [x] **V-2** descarga real (el usuario pone el token en `.env`) y revisión del resumen.
- [ ] **V-3** revisión a mano en VisiData y `seleccion.csv` (por categorías).
- [x] **W-1/W-2** `convertir`: hojas de `catalog:import` (mapas de opciones y categorías, handles, agrupación por `nombre_nuevo`).
- [x] **W-3** primera carga en local (Comida húmeda + Arneses/Collares).
- [x] Cierre de las herramientas: README §13, ESTADO, PENDIENTES.
- [ ] Al acabar la migración: revocar el token de Loyverse.

## 0. Decisiones del usuario (21-oct-2026)

| #   | Decisión                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------- |
| V1  | Carpeta `migracion/loyverse/`. TypeScript ejecutado por Node 24, como el resto del proyecto (no Python).                    |
| V2  | Descargar **todos** los tickets: sirven para la sugerencia y para análisis de ventas posteriores (meses, años, tendencias). |
| V3  | Una sola tienda en Loyverse: se usa el stock de esa tienda. Unos 1000 artículos.                                            |
| V4  | Revisión con hoja CSV (opción A) en **VisiData**, que el usuario ya tiene instalado.                                        |
| V5  | Sin fotos: el fotógrafo está haciendo fotos nuevas de todos los productos.                                                  |

## 2. Qué se ha hecho

### V-1 — Scripts (`migracion/loyverse/`, workspace `migracion-loyverse`)

- `src/api.ts`: cliente de solo lectura con `fetch`. Paginación por cursor (`limit` 250), ~1 petición por segundo y reintentos con espera exponencial ante 429, 5xx y errores de red. Nunca imprime el token.
- `src/descargar.ts`:
  - **catálogo** (artículos con los borrados, categorías, proveedores, impuestos, tiendas y stock de la tienda);
  - **tickets** por meses (`tickets/AAAA-MM.jsonl`), **reanudable**: los meses cerrados ya descargados se saltan;
  - de cada ticket se quitan el cliente, el empleado, la nota y los detalles de la tarjeta.
- `src/analisis.ts` (puro): ventas por variante (última venta, unidades e importe a 12 y 24 meses, devoluciones restadas, cancelados fuera), **sugerencia** `sí` / `no` / `revisar`, **problemas** (sin categoría, precio variable o 0, SKU o código de barras repetido; el stock negativo no se marca, decisión del usuario), **grupos de nombres parecidos** (posibles variantes), resumen por categoría y ventas diarias y mensuales en hora de Madrid.
- `src/analizar.ts`: escribe `datos/revision/revision.csv`, `por-categoria/*.csv`, `resumen-categorias.csv`, `ventas-diarias.csv` y `ventas-mensuales.csv`. Al regenerar, **conserva lo que ya escribió el usuario** (`decision`, `categoria_nueva`, `nombre_nuevo`, `notas`) por `variant_id`.
- `src/seleccion.ts`: `datos/seleccion.csv` con lo marcado `sí`, con las correcciones aplicadas; se para ante valores de `decision` no válidos.
- Tests con `node:test` (11), `tsc --noEmit`, ESLint y Prettier del monorepo.
- `datos/` y `.env` fuera de git (`.gitignore`). El workspace se añade a `pnpm-workspace.yaml` (`migracion/*`). Sin dependencias nuevas: `@types/node`, `typescript` y `@web-ecommerce/config`, en las versiones que ya tiene el monorepo.

### V-1b — Informe de ventas

- `src/estadisticas.ts` (puro): totales por año, mismo periodo de cada año, por mes, días abiertos, mapa de calor día × hora, categorías por año, productos (12 meses frente a los 12 anteriores), Pareto y formas de pago. Hora de Madrid, devoluciones restadas, cancelados fuera.
- `src/svg.ts`: barras, líneas, barras de variación y mapa de calor en SVG, con el valor al pasar el ratón (`<title>`); tema claro u oscuro según el sistema.
- `src/informe.ts`: `datos/informe/ventas.html` (~85 KB, sin JS ni recursos externos; comprobado en Chromium a 1200 y 390 px, sin desbordes).

### V-2 — Descarga real (21-oct-2026)

- 1334 artículos activos (3379 variantes; 811 variantes borradas), 26 categorías y 32 325 tickets desde el 17-sep-2021 (62 meses, ~50 MB de JSONL).
- Sugerencia: sí 1271 · revisar 901 · no 1207. Con problemas: 31 (sin el stock negativo).
- 2265 líneas de ticket de variantes que ya no existen en Loyverse (tampoco como borradas): cuentan en los totales y, en el informe, como «(fuera del catálogo)» con su nombre.

### W — De la selección a `catalog:import`

- `src/medusa.ts` (puro, con tests):
  - handles (`slugify` + únicos + reservados);
  - contenido neto desde el texto (`parseNet`);
  - mapas de opciones y categorías (con propuesta para las 25 categorías de Loyverse);
  - agrupación por `nombre_nuevo` (con `Formato` si hace falta);
  - avisos.
- `src/convertir.ts`: escribe `datos/medusa/` (`productos.csv`, `categorias.csv`, `avisos.csv`) y mantiene los mapas y `handles.csv` sin pisar lo que edita el usuario. Si falta algo en un mapa, se para.
- Lector CSV: opción de saltar las filas `#` (las plantillas del importador las llevan).
- **Primera carga en local** (22-oct-2026), con las hojas `01-comida-humeda.csv` y `02-arneses-collares.csv`:
  - `dry-run` sin errores;
  - opción nueva `Modelo` y valores nuevos en Sabor, Tamaño, Color y Talla;
  - **60 productos (329 variantes) creados**, publicados, con stock 0 y en `comida-humeda-perro` / `paseo-perro`;
  - segunda pasada: «60 sin cambios» (idempotente).

## 3. Decisiones tomadas

| Decisión                                                                   | Motivo                                                                                                               | Fuente                                                                 |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| API v1.0 con _Personal access token_                                       | Lo más simple para un uso puntual. OAuth no hace falta: no es una app para terceros.                                 | `developer.loyverse.com/docs/API-Reference__v1.0.yaml` (Authorization) |
| Paginación por `cursor` con `limit=250`, ~1 petición/s y reintentos en 429 | La API limita a 300 peticiones cada 300 s por cuenta.                                                                | Ídem (Pagination, API rate limits)                                     |
| `show_deleted=true` en artículos y categorías                              | Los tickets antiguos apuntan a artículos borrados; así salen con nombre en las ventas y se marcan `no`.              | Ídem (Soft deletion, parámetro `show_deleted`)                         |
| Tickets por meses (`created_at_min/max`) en JSONL                          | Reanudable, ficheros manejables y meses cerrados que no hay que volver a pedir.                                      | Ídem (`/receipts`)                                                     |
| Quitar cliente, empleado, nota y tarjeta de los tickets                    | No hacen falta para el análisis (minimización de datos, RGPD).                                                       | —                                                                      |
| Stock y precio de la tienda (`stores[]` de la variante)                    | El precio puede ser distinto por tienda; `VARIABLE` = sin precio fijo (se marca como problema).                      | Ídem (`store_override`, `GETInventory_level`)                          |
| Fechas en hora de Madrid                                                   | La API da UTC; las ventas de las 23:30 UTC en verano son del día siguiente.                                          | Ídem (Date and time format)                                            |
| TypeScript con Node 24 (_type stripping_)                                  | Sin compilar ni dependencias; mismo lenguaje que el resto del repo. Solo sintaxis «borrable» (`erasableSyntaxOnly`). | context7 `/nodejs/node` (`doc/api/typescript.md`)                      |
| Context7 no tiene Loyverse                                                 | Se usó la especificación OpenAPI oficial por HTTP (REGLA Nº 1, paso 3).                                              | —                                                                      |

## 4. Cómo usarlo

Ver [`migracion/loyverse/README.md`](../../migracion/loyverse/README.md): preparar el token, `descargar`, `analizar`, revisar en VisiData, `seleccion`.

## 5. Cómo testear esta fase

```bash
pnpm --filter migracion-loyverse test        # 23 tests (node:test), sin red
pnpm --filter migracion-loyverse typecheck
pnpm lint && pnpm format:check
# Real (con el token en migracion/loyverse/.env):
pnpm --filter migracion-loyverse descargar --solo-catalogo
pnpm --filter migracion-loyverse analizar
pnpm --filter migracion-loyverse informe     # datos/informe/ventas.html
pnpm --filter migracion-loyverse convertir datos/revision/por-categoria/01-….csv
pnpm --filter backend catalog:import ../../migracion/loyverse/datos/medusa dry-run
```

## 6. Criterio de salida

- [x] Scripts con tests, sin dependencias nuevas y con `datos/` fuera de git.
- [x] Descarga completa (catálogo + tickets) sin errores y con el resumen revisado por el usuario.
- [x] `seleccion` y `convertir` probados con las dos primeras categorías revisadas; primera carga en local.
- [ ] Resto de categorías (el usuario, de forma incremental).
- [ ] Token de Loyverse revocado.

## 7. Pendientes / riesgos

- **Token con acceso total** (también escritura): revocarlo al terminar.
- Los umbrales de la sugerencia (12, 24 y 6 meses) son una primera propuesta; ajustarlos tras ver el resumen real (`RULES` en `src/analisis.ts`).
- La agrupación de nombres parecidos es heurística (tallas, colores y medidas en español); revisar sus falsos positivos.
- Pendiente en la conversión: **granel** (cuando se revise esa categoría), analíticos, marca, descripción y pesos de envío (no están en Loyverse: a mano o en la fase de contenido).
- Opciones: muchos valores con grafías distintas («L 69-81cm», «S/M», «400gr» frente a «400g»); conviene normalizarlos antes de producción (los filtros de la tienda los agrupan por valor).
- `migracion/` y `loadtest/` fuera de las imágenes Docker (`.dockerignore`).
- Antes de producción: inventario → stock real (`stock:import` está pendiente en el backend, PENDIENTES §5) y decidir qué hacer con los productos mock.
