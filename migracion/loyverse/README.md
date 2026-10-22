# Migración desde Loyverse (tienda física)

Scripts para **descargar** el catálogo y los tickets de Loyverse, **revisar** a mano qué artículos pasan a la tienda online y sacar la **selección**. Pasar la selección a las plantillas de `catalog:import` es otra fase. Detalle y decisiones: [`docs/fases/faseV-loyverse.md`](../../docs/fases/faseV-loyverse.md).

- TypeScript ejecutado directamente con Node 24 (_type stripping_), sin dependencias.
- **Solo lectura** en Loyverse.
- **Todo lo descargado va en `datos/`, fuera de git.** El repo es público y son datos de la tienda.

## Preparar el token

1. En el back office de Loyverse: _Integraciones → Tokens de acceso → Añadir token_.
2. `cp .env.example .env` y escribe el token en `LOYVERSE_TOKEN=` con `nano .env`. Nunca lo pegues en un chat.
3. ⚠️ El token da **acceso total** a la cuenta, también de escritura. Al terminar la migración, **revócalo** en la misma página.

## Uso

```bash
cd migracion/loyverse        # o desde la raíz: pnpm --filter migracion-loyverse <script>
pnpm descargar               # catálogo + todos los tickets (la primera vez, varios minutos)
pnpm analizar                # hoja de revisión y resúmenes (sin red)
# … revisar datos/revision/revision.csv …
pnpm seleccion               # datos/seleccion.csv con lo marcado «sí»
pnpm informe                 # datos/informe/ventas.html: estadísticas de ventas (sin red)
```

Opciones de `descargar`:

| Opción            | Qué hace                                                                                                                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (ninguna)         | Catálogo completo y tickets desde el mes del artículo más antiguo. Los meses cerrados ya descargados se saltan, así que se puede cortar y relanzar. El mes en curso se vuelve a bajar siempre. |
| `--solo-catalogo` | Solo artículos, categorías, proveedores, impuestos y stock.                                                                                                                                    |
| `--solo-tickets`  | Solo tickets.                                                                                                                                                                                  |
| `--desde=AAAA-MM` | Tickets desde ese mes.                                                                                                                                                                         |
| `--forzar`        | Vuelve a bajar todos los meses, por ejemplo tras devoluciones o cancelaciones de meses antiguos.                                                                                               |

Límite de la API: 300 peticiones cada 300 s. El script va a ~1 petición por segundo, con 250 resultados por página, y reintenta si recibe un 429.

## Qué se descarga (`datos/bruto/`)

| Fichero                 | Contenido                                                                                                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `articulos.json`        | Artículos con sus variantes, **incluidos los borrados** (`deleted_at`).                                                                                                      |
| `categorias.json`       | Categorías.                                                                                                                                                                  |
| `proveedores.json`      | Proveedores.                                                                                                                                                                 |
| `impuestos.json`        | Impuestos.                                                                                                                                                                   |
| `tiendas.json`          | Tiendas.                                                                                                                                                                     |
| `stock.json`            | Stock de la tienda.                                                                                                                                                          |
| `tickets/AAAA-MM.jsonl` | Un ticket por línea. **Sin** cliente, empleado, nota ni datos de tarjeta: fechas, importes, tipo de pago y líneas (artículo, variante, cantidad, precio, coste y descuento). |

## La hoja de revisión (`datos/revision/`)

`revision.csv`: **una fila por variante**. Las vivas van primero, ordenadas por categoría y nombre; las borradas, al final.

| Columna                                                | Para qué                                                                                                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`decision`**                                         | **La rellenas tú**: `sí` (o `s`, `x`, `1`), `no` (o `n`, `0`) o vacía (sin revisar).                                                             |
| `sugerencia`, `motivo`                                 | Propuesta automática (abajo).                                                                                                                    |
| `categoria`, `articulo`, `variante`, `opciones`        | Lo que hay en Loyverse.                                                                                                                          |
| `sku`, `codigo_barras`                                 | Identificadores de la variante.                                                                                                                  |
| `precio`, `coste`, `margen_pct`, `stock`               | Precio de la tienda (vacío si el precio es variable), coste, margen y stock.                                                                     |
| `proveedor`, `iva`, `por_peso`                         | Datos del artículo en Loyverse.                                                                                                                  |
| `ultima_venta`                                         | Fecha de la última venta.                                                                                                                        |
| `uds_12m`, `uds_24m`, `uds_total`                      | Unidades vendidas en 12 meses, 24 meses y en total, ya descontadas las devoluciones.                                                             |
| `importe_12m`, `importe_total`                         | Lo mismo, en euros.                                                                                                                              |
| `alta`, `modificado`, `borrado`                        | Fechas y estado en Loyverse.                                                                                                                     |
| `problemas`                                            | Sin categoría, precio variable o 0, SKU o código de barras repetido. El stock negativo no se marca (se vende sin dar entrada a la mercancía).    |
| `grupo_sugerido`                                       | Artículos cuyo nombre coincide quitando talla, color y medidas: **posibles variantes de un mismo producto** («Collar nylon rojo M», «… azul L»). |
| **`categoria_nueva`**, **`nombre_nuevo`**, **`notas`** | **Las rellenas tú** si quieres corregir.                                                                                                         |
| `item_id`, `variant_id`                                | Ids de Loyverse. **No los toques**: con ellos se conserva tu revisión.                                                                           |

**Sugerencia automática** (umbrales en `src/analisis.ts`, `RULES`):

| Sugerencia | Cuándo                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| `sí`       | Vendido en los últimos 12 meses.                                                                                         |
| `no`       | Borrado en Loyverse, nunca vendido y sin stock, o sin ventas en 24 meses y sin stock.                                    |
| `revisar`  | El resto: dado de alta hace menos de 6 meses, con stock pero sin ventas, o con la última venta hace entre 12 y 24 meses. |

**Volver a generar la hoja no pierde tu trabajo.** `analizar` conserva `decision`, `categoria_nueva`, `nombre_nuevo` y `notas`, emparejando las filas por `variant_id`, y deja una copia de la hoja anterior en `revision/copias/`. Se puede volver a descargar y a analizar a mitad de la revisión, pero **cierra antes la hoja en VisiData o LibreOffice** (o guárdala y recárgala después): si no, al guardar desde el editor se pisaría la versión nueva.

Otros ficheros:

- `por-categoria/*.csv`: la misma hoja partida por categoría. **También se puede revisar ahí**, incluso con copias renombradas como `01-pienso.csv`. `analizar` recoge sus decisiones, las pasa a `revision.csv` y vuelve a generar solo sus propios ficheros; tus copias renombradas se quedan como están.
- `resumen-categorias.csv`: variantes, sugerencias, ventas e importe a 12 meses por categoría.
- `ventas-diarias.csv`: tickets, devoluciones, importe, impuestos, descuentos y ticket medio por día, en hora de Madrid.
- `ventas-mensuales.csv`: unidades, importe y coste por mes y variante, en formato largo para tablas dinámicas.

### Revisar con VisiData

```bash
vd datos/revision/revision.csv
```

| Tecla    | Acción                                                                                            |
| -------- | ------------------------------------------------------------------------------------------------- |
| `F`      | Sobre la columna `categoria`: frecuencia por categoría. `Enter` abre solo esa categoría.          |
| `\|`     | Selecciona filas por expresión regular (p. ej. en `sugerencia`: `^no$`).                          |
| `e`      | Edita una celda.                                                                                  |
| `ge`     | Edita la columna en todas las filas seleccionadas (p. ej. poner `no` a todas las sugeridas `no`). |
| `[`, `]` | Ordena.                                                                                           |
| `Ctrl-S` | Guarda. **Como CSV y con el mismo nombre**, `revision.csv`.                                       |
| `q`      | Vuelve atrás.                                                                                     |

Si editas desde una hoja abierta con `F` + `Enter`, los cambios se aplican también a la hoja original: guarda desde la hoja principal. Con LibreOffice, guarda como **CSV UTF-8**; el separador `;` también vale.

## Informe de ventas (`datos/informe/ventas.html`)

Un único HTML, sin JS ni recursos externos: se abre con doble clic y funciona sin conexión. Los datos no salen del ordenador. Importes **con IVA**, devoluciones restadas, tickets cancelados fuera y fechas en hora de Madrid. **Sin márgenes**: el coste de Loyverse no es fiable.

| Sección        | Qué muestra                                                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resumen        | Ventas, tickets, ticket medio, artículos por ticket, devoluciones y descuentos por año, y el **mismo periodo** (1 de enero → fecha del último ticket) de cada año, para comparar el año en curso. |
| Evolución      | Ventas de cada mes con la media móvil de 12 meses (la tendencia sin la estacionalidad).                                                                                                           |
| Interanual     | Cada mes frente al mismo mes del año anterior (%).                                                                                                                                                |
| Estacionalidad | Cada mes por año, y la venta media por día abierto.                                                                                                                                               |
| Días y horas   | Mapa de calor día de la semana × hora, y tickets y ticket medio por día.                                                                                                                          |
| Categorías     | Ventas por categoría y año (categoría actual en Loyverse). «(fuera del catálogo)» = artículos que ya no existen.                                                                                  |
| Productos      | Los 30 más vendidos en 12 meses, Pareto (cuántos hacen el 80 %), y los que más suben y bajan frente a los 12 meses anteriores.                                                                    |
| Formas de pago | Importe y % por año (efectivo, tarjeta, Bizum…).                                                                                                                                                  |

Para actualizarlo: `pnpm descargar --solo-tickets` (baja solo el mes en curso) y `pnpm informe`.

## Selección (`datos/seleccion.csv`)

```bash
pnpm seleccion                                              # desde revision.csv (todo)
pnpm seleccion datos/revision/por-categoria/01-pienso.csv … # solo esas hojas (para probar)
pnpm seleccion --volcar datos/revision/por-categoria/01-pienso.csv …  # pasa sus decisiones a revision.csv
```

Contiene solo las filas marcadas `sí`. Si las rellenaste, `categoria` y `articulo` llevan `categoria_nueva` y `nombre_nuevo`; los valores originales de Loyverse quedan en `categoria_loyverse` y `articulo_loyverse`. Un valor no válido en `decision` (p. ej. «quizá») para el script con la línea exacta.

## Pasar a Medusa (`datos/medusa/`, fase W)

Por categorías: se revisa una, se convierte, se comprueba con `dry-run` y se carga. El importador es idempotente: actualiza por `handle` y `sku`, y lo que no está en la hoja no se toca. Se pueden ir cargando categorías y volver a cargar una ya corregida.

```bash
cd migracion/loyverse
pnpm convertir datos/revision/por-categoria/01-comida-humeda.csv …   # o sin hojas: todo revision.csv
# 1.ª vez (o con opciones o categorías nuevas): revisa los mapas y vuelve a ejecutar
cd ../../apps/backend
pnpm catalog:import ../../migracion/loyverse/datos/medusa dry-run
pnpm catalog:import ../../migracion/loyverse/datos/medusa
```

| Fichero                   | Qué es                                                                                                                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `productos.csv`           | Hoja para `catalog:import`: una fila por variante, **stock 0** (se carga tras el inventario), **publicado**, IVA 21/10/4 → general/reducido/superreducido, `neto_g`/`neto_ml` sacados del nombre o de la opción («400g»). |
| `categorias.csv`          | Copia del árbol nuevo (`apps/backend/catalog/mi-carga/categorias.csv`).                                                                                                                                                   |
| `avisos.csv`              | Lo que conviene revisar: productos agrupados, handles repetidos, combinaciones repetidas, sin categoría, sin precio…                                                                                                      |
| **`mapa-opciones.csv`**   | Opción de Loyverse → opción de la tienda (`talla` → `Talla`, `menu` → `Sabor`…). **Lo editas tú**. Si aparece una opción nueva, se añade con una propuesta y `convertir` se para.                                         |
| **`mapa-categorias.csv`** | Categoría de Loyverse → handle(s) del árbol nuevo (`a\|b`). **Lo editas tú**. Si una fila de la revisión tiene `categoria_nueva` (handles), manda esa.                                                                    |
| **`handles.csv`**         | Handle de cada producto. Se propone desde el título; **corrígelo aquí** y se respeta en las siguientes conversiones. Es la URL: no lo cambies tras cargar a producción.                                                   |

- **Agrupar**: los artículos con el mismo `nombre_nuevo` en la revisión pasan a ser un solo producto. Si sus opciones no los distinguen, se añade la opción `Formato` con el nombre del artículo de Loyverse, y queda anotado en `avisos.csv`.
- **Opciones**: en Medusa son globales. El `dry-run` lista los valores nuevos, para cazar erratas. Un producto ya creado no puede cambiar de opciones desde la hoja, así que agrupa y mapea **antes** de la primera carga de cada categoría.

## Tests

```bash
pnpm --filter migracion-loyverse test        # node:test, sin red
pnpm --filter migracion-loyverse typecheck
```
