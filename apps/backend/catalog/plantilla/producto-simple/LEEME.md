# Producto simple (sin opciones)

Una fila = un producto con una sola variante (una taza, un libro). Sin columnas `opcion:*`: se crea con la variante
«Única» (opción «Formato»), que la tienda no muestra ni usa como filtro. El ejemplo cubre: los tres tipos de **IVA**, un
**borrador**, **etiquetas**, **colección** (`destacados` = carrusel de la home, la crea `seed`), **relacionados**,
**oferta**, medidas, contenido neto en ml y una descripción con **formato**.

```bash
pnpm --filter backend catalog:import catalog/plantilla/categorias   # el árbol de los ejemplos (una vez)
pnpm --filter backend catalog:import catalog/plantilla/producto-simple dry-run
pnpm --filter backend catalog:import catalog/plantilla/producto-simple
```

**Una fila por variante.** Las filas de un producto van **seguidas** y con el mismo `handle`. Los datos del producto (de `titulo` a `granel`, incluidos los analíticos) van **solo en la primera fila**. En las demás, déjalos vacíos.

## Datos del producto

| Columna          | Obligatoria | Ejemplo                       | Notas                                                                                                                                                                                                                                                                     |
| ---------------- | ----------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `handle`         | sí          | `collar-nylon`                | En todas las filas del producto.                                                                                                                                                                                                                                          |
| `titulo`         | al crear    | `Collar de nailon`            | Empieza en mayúscula: la tienda ordena distinguiendo mayúsculas (aviso si no).                                                                                                                                                                                            |
| `subtitulo`      | no          | `Hebilla rápida`              |                                                                                                                                                                                                                                                                           |
| `descripcion`    | no          |                               | Admite saltos de línea (entre comillas, como hace Excel) y [formato](../LEEME.md#descripciones-con-formato).                                                                                                                                                              |
| `categorias`     | no          | `collares-perro`              | Handles separados por `\|`. Si tiene valor, **sustituye** las actuales. `-` = ninguna.                                                                                                                                                                                    |
| `etiquetas`      | no          | `novedad\|reflectante`        | Separadas por `\|`. Las que no existan se crean. Sustituye las actuales. `-` = ninguna. Salen como **filtro** en la tienda y se buscan: solo etiquetas para el cliente.                                                                                                   |
| `iva`            | no          | `reducido`                    | `general` (21 %), `reducido` (10 %), `superreducido` (4 %). Por defecto, general.                                                                                                                                                                                         |
| `coleccion`      | no          | `destacados`                  | Handle de una colección creada en el Admin. `-` = quitarla. La colección `destacados` es el carrusel de la home (`home.yaml` del storefront).                                                                                                                             |
| `estado`         | no          | `publicado`                   | `publicado` / `borrador`. Por defecto `publicado`.                                                                                                                                                                                                                        |
| `material`       | no          | `Nailon`                      |                                                                                                                                                                                                                                                                           |
| `marca`          | no          | `Hiro`                        | Se guarda en `metadata.marca`.                                                                                                                                                                                                                                            |
| `granel`         | no          | `sí`                          | Producto a granel: ver [Granel](../granel/LEEME.md).                                                                                                                                                                                                                      |
| `sin_stock`      | no          | `sí`                          | Fase CS. Sin control de stock: siempre disponible, sin reservas (se hace por encargo, como la [caja de snacks](../caja/LEEME.md)). Deja `stock` vacío. No vale con `granel`.                                                                                              |
| `descatalogado`  | no          | `sí`                          | `sí` / `no`. Ver [Descatalogar un producto](../descatalogado/LEEME.md).                                                                                                                                                                                                   |
| `sustituto`      | no          | `collar-nylon-2`              | Handle del producto que lo sustituye. `-` = quitarlo.                                                                                                                                                                                                                     |
| `genera_puntos`  | no          | `no`                          | Fase CS (antes `sin_puntos`). `no` = el producto **no genera puntos** del programa de fidelización. Vacío = no tocar (por defecto, sí genera).                                                                                                                            |
| `pago_descuento` | no          | `no`                          | Fase CS. `no` = **no admite códigos descuento, promociones ni pago con puntos** (campo `discountable` de Medusa: los puntos son una promoción y no se pueden separar). Vacío = no tocar (por defecto, sí). En el carrito, el checkout y la ficha sale con `*` y una nota. |
| `relacionados`   | no          | `collar-cuero \| correa-roja` | Fase R. Handles de otros productos, separados por `\|`, en el orden en que quieres verlos (máx. 8). La ficha muestra 4: si hay menos, completa con otros de su categoría. El carrito sugiere los relacionados de lo que lleva. `-` = borrar.                              |
| `plantilla`      | no          | `arnes`                       | Fase O. Plantilla de la ficha (`apps/storefront/src/content/plantillas/<id>.md`). Vacío: la de su categoría, si la tiene. `-` = quitarla. Ver [Fichas con plantilla y selector](../selector-fotos/LEEME.md).                                                              |
| `guia_tallas`    | no          | `marca-m-arnes-a`             | Fase O. Guía de tallas del modelo (`apps/storefront/src/content/guias/<id>.md`). `-` = quitarla.                                                                                                                                                                          |
| `opcion_fotos`   | no          | `Estampado`                   | Fase O. Opción cuyas fotos cambian la galería al elegirla (fotos `handle--valor_01.jpg`). Tiene que ser una de las opciones del producto. `-` = quitarla.                                                                                                                 |
| `diseno`         | no          | `estandar`                    | Fase DS. Diseño de la ficha. Vacío = el de su categoría (`diseno_productos`) o el estándar; `-` = quitarlo. Ver [Diseños](../diseno/LEEME.md).                                                                                                                            |

## Datos de la variante

| Columna         | Obligatoria  | Ejemplo         | Hereda | Notas                                                                                       |
| --------------- | ------------ | --------------- | ------ | ------------------------------------------------------------------------------------------- |
| `sku`           | sí           | `COL-NYL-S-ROJ` | no     | Único en toda la tienda; identifica la variante al volver a cargar.                         |
| `ean`           | no           | `8400000000024` | no     | Único. `-` = borrarlo.                                                                      |
| `precio`        | 1.ª variante | `19,95`         | sí     | Euros **con IVA incluido** (`19,95`, `19.95` o `19,95 €`).                                  |
| `precio_oferta` | no           | `17,95`         | sí     | Menor que `precio`. `-` = sin oferta (en esa variante y las de debajo).                     |
| `stock`         | no           | `10`            | no     | Unidades. **Solo al crear la variante**: volver a cargar la hoja no lo cambia. Vacío = 0.   |
| `peso_g`        | no           | `60`            | sí     | Gramos **de envío** (con envase).                                                           |
| `largo_mm`      | no           | `300`           | sí     | Milímetros.                                                                                 |
| `ancho_mm`      | no           | `250`           | sí     | Milímetros.                                                                                 |
| `alto_mm`       | no           | `20`            | sí     | Milímetros.                                                                                 |
| `neto_g`        | no           | `3000`          | sí     | **Contenido neto** en gramos (3 kg de pienso → `3000`). Precio por kilo en ficha y tarjeta. |
| `neto_ml`       | no           | `350`           | sí     | Contenido neto en mililitros (champús, lociones). Precio por litro. Uno de los dos.         |

**Herencia**: en las columnas que heredan, una celda vacía coge el valor de la **fila de arriba del mismo producto** (nunca del producto anterior). Ejemplo:

| opcion:Talla | opcion:Color | precio | → precio final |
| ------------ | ------------ | ------ | -------------- |
| S            | Rojo         | 12,95  | 12,95          |
| S            | Azul         |        | 12,95          |
| L            | Rojo         | 15,95  | 15,95          |
| L            | Azul         |        | 15,95          |

La **oferta va con su precio**: si una fila escribe su propio `precio` y deja `precio_oferta` vacío, **no** hereda la oferta de arriba (la variante queda sin oferta). En la plantilla, «L Rojo» trae 15,95 con oferta 13,95, y «L Azul», con las dos celdas vacías, hereda ambas.

**Ofertas**: `precio_oferta` va a la Price List `sale` «Catálogo — ofertas», que gestiona el importador: no la edites a mano. La hoja manda: una variante de la hoja sin oferta sale de la lista. Las listas de precios creadas en el Admin no se tocan. El precio tachado de la tienda es `precio`.
