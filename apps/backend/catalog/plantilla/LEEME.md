# Importador de catálogo — plantillas

`catalog:import` carga **categorías** y **productos con variantes** desde dos hojas CSV y, si está, las **familias** de las opciones desde una tercera ([`familias.csv`](#familias)). Primero las categorías, después los productos y por último las familias. Detalle técnico y decisiones en [`docs/fases/faseC-catalogo.md`](../../../../docs/fases/faseC-catalogo.md).

```bash
# 1. Copia esta carpeta a una tuya (apps/backend/catalog/* está fuera de git, salvo plantilla/)
cp -r apps/backend/catalog/plantilla apps/backend/catalog/mi-carga
# 2. Rellena categorias.csv y productos.csv (y, si quieres agrupar filtros, familias.csv)
# 3. Comprueba (no escribe nada) y carga
pnpm --filter backend catalog:import catalog/mi-carga dry-run
pnpm --filter backend catalog:import catalog/mi-carga
# 4. Fotos (handle_01.jpg = miniatura, handle_02.jpg…)
pnpm --filter backend images:import catalog/mi-carga/fotos dry-run
pnpm --filter backend images:import catalog/mi-carga/fotos
# 5. Publicar los cambios en la tienda: rebuild del storefront (el catálogo se genera en el build)
```

## Antes de empezar (catálogo real)

Decisiones que conviene tomar **antes** de rellenar cientos de filas, porque cambiarlas después cuesta:

1. **Árbol de categorías definitivo** (`categorias.csv`): los `handle` van en la URL y no se cambian. Productos solo en la hoja más concreta. Cómo se ve en la tienda: [En la tienda](#en-la-tienda-categorías).
2. **Nombres de opciones y valores** comunes a toda la tienda (`Talla`, `Color`, `Tamaño`, `Sabor`…) y una sola grafía por valor: `S/M` o `S-M`, `400 g` o `400g`. Mezclarlas duplica valores en los filtros. El `dry-run` lista los valores nuevos: revísalos siempre.
3. **Etiquetas**: salen como filtro en la tienda. Pocas y con un criterio (`natural`, `sin cereales`, `cachorro`…). Las internas no deben ir aquí.
4. **Plantillas y guías de tallas** (Markdown en el storefront): cuáles hacen falta y con qué `id`, antes de escribir `plantilla`/`guia_tallas` en la hoja. Ver [Fichas con plantilla y selector](#fichas-con-plantilla-y-selector).
5. **Fotos**: nombre de fichero = `handle` (JPG), así que los handles tienen que estar decididos antes de renombrar fotos.
6. **Carga por partes**: una carpeta por tanda (p. ej. `mi-carga/categorias.csv` + `productos.csv` de una categoría). Cada carga solo añade o actualiza: lo que no está en la hoja no se toca.
7. **Desde Loyverse**: `migracion/loyverse/` genera estas mismas hojas (`convertir`, con stock 0); se pueden completar a mano antes de cargarlas ([README](../../../../migracion/loyverse/README.md)).

## Reglas generales

- **Formato**: CSV **UTF-8**. En Excel: _Guardar como → CSV UTF-8 (delimitado por comas)_. El separador puede ser `,` o `;`, y el importador lo detecta solo. Si el fichero no está en UTF-8, se rechaza (las tildes saldrían mal).
- **Comentarios**: las filas que empiezan por `#` se ignoran. Las plantillas llevan arriba un resumen de estas reglas: puedes dejarlo o borrarlo. Las filas vacías también se ignoran.
- **Cabeceras**: sin mayúsculas ni tildes obligatorias (`Título` = `titulo`). Las columnas opcionales se pueden quitar. Una columna desconocida es un error, para cazar erratas.
- **Celda vacía = no tocar**. Al actualizar, lo vacío conserva lo que ya hay en la tienda. Un guion `-` **borra** el valor.
- **Todo o nada**: se valida todo antes de escribir. Si hay un solo error, no se carga nada y sale un informe por fila y columna (`productos.csv:14 [precio] …`).
- **Se puede repetir**: categorías y productos se actualizan por `handle` y las variantes por `sku`. Volver a cargar la misma hoja no cambia nada. Lo que está en la tienda y no en la hoja **se ignora**: no se borra.
- **handle**: identificador en la URL (`/producto/collar-nylon/`, `/categoria/pienso-perro/`). Va en minúsculas, con números y guiones. **No lo cambies después**: sería otro producto y la URL antigua daría 404. Si es imprescindible, cámbialo en el Admin y añade la redirección en `apps/storefront/src/lib/redirects.mjs` (Fase E). Para retirar un producto, no lo borres: [descatalógalo](#descatalogar-un-producto). Es **único en toda la tienda**: dos subcategorías «Juguetes» (perro y gato) necesitan `juguetes-perro` y `juguetes-gato`.

## categorias.csv

Una fila por categoría.

| Columna            | Obligatoria | Ejemplo              | Notas                                                                                                                                                                      |
| ------------------ | ----------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `handle`           | sí          | `pienso-perro`       | Único en toda la tienda.                                                                                                                                                   |
| `nombre`           | al crear    | `Pienso`             | Empieza en mayúscula (aviso si no).                                                                                                                                        |
| `padre`            | no          | `alimentacion-perro` | **`handle`** del padre (no su nombre): otra fila de la hoja o una categoría que ya exista. Vacío = categoría principal. Si escribes el nombre, el error propone el handle. |
| `descripcion`      | no          |                      | `-` = borrarla.                                                                                                                                                            |
| `orden`            | no          | `0`                  | Posición entre las hermanas (0, 1, 2…).                                                                                                                                    |
| `activa`           | no          | `sí`                 | `sí` / `no`. Por defecto `sí`.                                                                                                                                             |
| `diseno`           | no          | `estandar`           | Fase DS. Diseño de la **página** de la categoría (no pasa a sus subcategorías). Vacío = estándar; `-` = quitarlo. Ver [Diseños](#diseños).                                 |
| `diseno_productos` | no          | `estandar`           | Fase DS. Diseño de las **fichas** de sus productos y de los de sus subcategorías (salvo que el producto tenga uno propio). `-` = quitarlo.                                 |

**Productos solo en la subcategoría más concreta** (`pienso-perro`, no también `alimentacion-perro` ni `perro`): la página del padre suma los productos de sus hijas.

### En la tienda (categorías)

- Cada categoría tiene su página `/categoria/<handle>/` con la miga de pan (Perro › Paseo › Correas) y el menú «Tienda» de la cabecera.
- **Fila de categorías** encima de la rejilla: en un padre, sus hijas; en una hoja, sus hermanas con ella marcada; si no tiene hermanas, ella sola marcada (para subir, la miga de pan).
- `orden` decide el orden en el menú y en la fila; con el mismo `orden`, alfabético por nombre. `descripcion` sale bajo el título de la página de la categoría (admite [formato](#descripciones-con-formato)) y, sin marcas y recortada a 160 caracteres, como meta descripción (SEO).
- Una categoría **sin productos publicados** (en ella o en sus hijas) no sale en la tienda. `activa = no` la oculta aunque tenga productos.
- Árbol nuevo o cambiado → **rebuild del storefront** (las páginas de categoría se generan en el build).

## productos.csv

**Una fila por variante.** Las filas de un producto van **seguidas** y con el mismo `handle`. Los datos del producto (de `titulo` a `granel`, incluidos los analíticos) van **solo en la primera fila**. En las demás, déjalos vacíos.

### Datos del producto (primera fila)

| Columna         | Obligatoria | Ejemplo                       | Notas                                                                                                                                                                                                                                        |
| --------------- | ----------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `handle`        | sí          | `collar-nylon`                | En todas las filas del producto.                                                                                                                                                                                                             |
| `titulo`        | al crear    | `Collar de nailon`            | Empieza en mayúscula: la tienda ordena distinguiendo mayúsculas (aviso si no).                                                                                                                                                               |
| `subtitulo`     | no          | `Hebilla rápida`              |                                                                                                                                                                                                                                              |
| `descripcion`   | no          |                               | Admite saltos de línea (entre comillas, como hace Excel) y [formato](#descripciones-con-formato).                                                                                                                                            |
| `categorias`    | no          | `collares-perro`              | Handles separados por `\|`. Si tiene valor, **sustituye** las actuales. `-` = ninguna.                                                                                                                                                       |
| `etiquetas`     | no          | `novedad\|reflectante`        | Separadas por `\|`. Las que no existan se crean. Sustituye las actuales. `-` = ninguna. Salen como **filtro** en la tienda y se buscan: solo etiquetas para el cliente.                                                                      |
| `iva`           | no          | `reducido`                    | `general` (21 %), `reducido` (10 %), `superreducido` (4 %). Por defecto, general.                                                                                                                                                            |
| `coleccion`     | no          | `destacados`                  | Handle de una colección creada en el Admin. `-` = quitarla. La colección `destacados` es el carrusel de la home (`home.yaml` del storefront).                                                                                                |
| `estado`        | no          | `publicado`                   | `publicado` / `borrador`. Por defecto `publicado`.                                                                                                                                                                                           |
| `material`      | no          | `Nailon`                      |                                                                                                                                                                                                                                              |
| `marca`         | no          | `Hiro`                        | Se guarda en `metadata.marca`.                                                                                                                                                                                                               |
| `granel`        | no          | `sí`                          | Producto a granel: ver [Granel](#granel).                                                                                                                                                                                                    |
| `descatalogado` | no          | `sí`                          | `sí` / `no`. Ver [Descatalogar un producto](#descatalogar-un-producto).                                                                                                                                                                      |
| `sustituto`     | no          | `collar-nylon-2`              | Handle del producto que lo sustituye. `-` = quitarlo.                                                                                                                                                                                        |
| `sin_puntos`    | no          | `sí`                          | El producto no genera puntos del programa de fidelización (Fase L). Vacío = no tocar.                                                                                                                                                        |
| `relacionados`  | no          | `collar-cuero \| correa-roja` | Fase R. Handles de otros productos, separados por `\|`, en el orden en que quieres verlos (máx. 8). La ficha muestra 4: si hay menos, completa con otros de su categoría. El carrito sugiere los relacionados de lo que lleva. `-` = borrar. |
| `plantilla`     | no          | `arnes`                       | Fase O. Plantilla de la ficha (`apps/storefront/src/content/plantillas/<id>.md`). Vacío: la de su categoría, si la tiene. `-` = quitarla. Ver [Fichas con plantilla y selector](#fichas-con-plantilla-y-selector).                           |
| `guia_tallas`   | no          | `marca-m-arnes-a`             | Fase O. Guía de tallas del modelo (`apps/storefront/src/content/guias/<id>.md`). `-` = quitarla.                                                                                                                                             |
| `opcion_fotos`  | no          | `Estampado`                   | Fase O. Opción cuyas fotos cambian la galería al elegirla (fotos `handle--valor_01.jpg`). Tiene que ser una de las opciones del producto. `-` = quitarla.                                                                                    |
| `diseno`        | no          | `estandar`                    | Fase DS. Diseño de la ficha. Vacío = el de su categoría (`diseno_productos`) o el estándar; `-` = quitarlo. Ver [Diseños](#diseños).                                                                                                         |

### Componentes analíticos (primera fila)

Para piensos, latas y snacks. Porcentajes **tal cual** (como en la etiqueta), de 0 a 100, con coma o punto (`2,5`). Se guardan en la metadata del producto. `-` = borrar.

| Columna        | Ejemplo | Notas                                                                          |
| -------------- | ------- | ------------------------------------------------------------------------------ |
| `proteina_pct` | `26`    | Proteína bruta.                                                                |
| `grasa_pct`    | `15`    | Grasa bruta (aceites y grasas).                                                |
| `fibra_pct`    | `2,5`   | Fibra bruta.                                                                   |
| `cenizas_pct`  | `7,5`   | Cenizas brutas (materia inorgánica).                                           |
| `humedad_pct`  | `9`     | Humedad. **Sin ella no se podrá filtrar sobre materia seca** (aviso si falta). |

- Aviso si los componentes suman más de 100.
- **Otros componentes** solo para mostrar en la ficha: una columna `analitico:Nombre` con texto libre (`analitico:Calcio` → `1,2 %`, `analitico:Omega 3` → `0,8 %`). Se guardan como `metadata["analitico:Calcio"]`.
- En la tienda (Fase S, S-2): la ficha muestra una tabla con todos los componentes, **tal cual** y **sobre materia seca** (`x / (100 − humedad)`; los `analitico:X`, solo tal cual). En `/buscar/` se puede filtrar por **proteína y grasa sobre materia seca** (mínimo y máximo). Sin `humedad_pct`, el producto no aparece en esos filtros.

### Opciones (prefijo `opcion:`)

- Hay **una columna por opción**, con el prefijo **`opcion:`** en la cabecera: `opcion:Talla`, `opcion:Color`, `opcion:Proteína`, `opcion:Tamaño`… Para una opción nueva **basta con añadir una columna** (p. ej. `opcion:Sabor`).
- Las opciones son **globales**: todos los productos comparten «Talla», «Color»… Así los filtros de la tienda suman bien. Las opciones y los valores que no existan **se crean**. El `dry-run` los lista antes («Valores nuevos en Color: Burdeos»): revísalo para cazar erratas.
- Los valores se comparan sin mayúsculas ni tildes (`azul` = `Azul`), y se usa la grafía que ya existe en la tienda.
- Cada producto rellena **solo sus opciones**, y **todas** sus variantes llevan valor en ellas. Dos variantes del mismo producto no pueden repetir combinación.
- **Producto sin variantes**: una sola fila, sin opciones. Se crea con la variante «Única» (opción «Formato»), que la tienda no muestra ni usa como filtro.
- **En la ficha**: con **una** opción, una tabla con precio y stock por variante; con **dos o más** (o una con fotos o color por valor), el [selector de muestras](#fichas-con-plantilla-y-selector). Cada opción con más de un producto sale como **filtro** en la tienda (salvo las marcadas como no filtrables).
- A un producto ya creado no se le pueden añadir ni quitar opciones desde la hoja; eso se hace en el Admin. Sí se pueden añadir variantes nuevas o valores nuevos.

### Datos de la variante (cada fila)

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

## Familias

Cada marca nombra sus colores a su manera («Huckleberry», «Sea Foam», «Rojo intenso»…) y algunas dan las tallas en centímetros. Con los nombres originales, el filtro «Color» se llena de valores con un solo producto. Las **familias** agrupan los valores de una opción para los **filtros** de la tienda: quien filtra por «Azul» ve todo lo que tiene algún color azul, de cualquier marca. La **ficha** y la **búsqueda por texto** siguen con los nombres originales (buscar «huckleberry» lo encuentra).

Sirve para cualquier opción (Color, Talla, Sabor…). Una opción con familias se filtra por familias; una sin familias, por sus valores, como siempre. La hoja `familias.csv` es **opcional** y se aplica **después** de los productos (los valores tienen que existir).

```csv
opcion,familia,nombre,color,valor,familias,color_muestra
Color,plantilla,,,,,
Talla,s,S,,,,
Talla,m,M,,,,
Color,,,,Sea Foam,verde|azul,#8fd3c1
Color,,,,Huckleberry,morado,
Talla,,,,35–45 cm,s|m,
```

Hay dos tipos de fila:

| Fila        | Columnas                                       | Qué hace                                                                                                                                                                                                                                                                                                                                                |
| ----------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Definir** | `opcion`, `familia`, `nombre`, `color`         | Las familias de la opción, en el orden de las filas. `familia` = id (minúsculas, números y guiones; va en la URL del filtro), `nombre` = lo que sale en el filtro, `color` = punto de color `#rrggbb` (opcional). `plantilla` carga las 12 de color de una vez. **Sustituyen** a las que tenga la opción; una opción que no aparece conserva las suyas. |
| **Asignar** | `opcion`, `valor`, `familias`, `color_muestra` | A qué familias pertenece el valor (varias con `\|`, como mucho 4; `-` = ninguna) y el color de su muestra en la ficha (`#rrggbb`; `-` = quitarlo; vacío = no tocar). Solo se tocan los valores de la hoja.                                                                                                                                              |

Las 12 familias de la `plantilla`: Negro, Gris, Blanco, Marrón y beige, Rojo, Rosa, Naranja, Amarillo, Verde, Azul, Morado y Multicolor (ids `negro`, `gris`, `blanco`, `marron-beige`, `rojo`, `rosa`, `naranja`, `amarillo`, `verde`, `azul`, `morado`, `multicolor`).

- El `dry-run` enseña las familias de cada opción y los valores que cambian. **Errores** (no se carga nada): opción o valor que no existen, familia no definida, id o color mal escrito, más de 4 familias por valor, filas repetidas. **Avisos**: valores de una opción con familias que se quedan sin ninguna (no saldrían en el filtro).
- Volver a cargar la misma hoja no cambia nada. El resto de la metadata de opciones y valores (p. ej. `filtrable`) se conserva.
- Los tonos frontera pueden ir en dos familias (`Sea Foam` → `verde|azul`). Las tallas por familias son orientativas: la talla exacta y la guía siguen en la ficha.
- Las familias se ven en la tienda tras un **rebuild** (categorías); `/buscar/` en cuanto se reindexa (automático).
- Si alguien filtra por una familia en `/buscar/` y abre un producto, la ficha llega con una combinación **con stock** de esa familia ya marcada (sin JS, la de siempre).

### Desde el Admin (sin hoja)

Lo mismo se puede hacer a mano en **Admin → Options → la opción** (p. ej. «Color»), en la tarjeta **«Familias para los filtros de la tienda»**:

1. **Familias**: «Cargar las 12 de color» o «+ Añadir familia» (nombre; el id se rellena solo; color del punto, opcional). ▲▼ para ordenarlas (el orden es el del filtro). «Quitar» la saca también de los valores.
2. **Valores**: una casilla por familia (como mucho 4 por valor) y **«Muestra en la ficha»** (el color del botón del valor en el selector si no tiene foto). «Solo sin familia» enseña los que faltan; el aviso «N sin familia ⚠» cuenta los que no saldrían en el filtro.
3. **Guardar**. Hace lo mismo que la hoja (mismas reglas y validaciones) y reindexa `/buscar/` solo. «Descartar cambios» vuelve a lo guardado.

Hoja y Admin se pueden mezclar: lo último que se guarda manda. En una opción exclusiva de un producto no hay familias.

## Descripciones con formato

Las descripciones de **productos y categorías** (hoja o Admin) y de **colecciones** (widget del Admin) se escriben en texto y la tienda les da formato en el build (`apps/storefront/src/lib/rich-text.ts`):

| Escribe                                                            | Sale                                  |
| ------------------------------------------------------------------ | ------------------------------------- |
| Una línea en blanco                                                | Párrafo nuevo                         |
| Un salto de línea                                                  | Salto de línea (dentro del párrafo)   |
| `- Texto`, `* Texto`, `• Texto` (o `*Texto` pegado)                | Lista con viñetas                     |
| `1. Texto` o `1) Texto`                                            | Lista numerada                        |
| `## Título` (`###` para uno más pequeño)                           | Subtítulo                             |
| `---` sola en su línea                                             | Separador                             |
| `**negrita**` · `*cursiva*` o `_cursiva_` · `~~tachado~~`          | **negrita** · _cursiva_ · ~~tachado~~ |
| `[texto](/guia-tallas/)`, `[texto](https://…)`, `mailto:` y `tel:` | Enlace                                |

- El HTML que se escriba **sale como texto** (no se interpreta) y los enlaces solo admiten esos tipos.
- La meta descripción (Google) y el JSON-LD usan el texto **sin** las marcas.
- Se ve tras un **rebuild** del storefront, como el resto del catálogo.

## Granel

Para snacks, premios o pienso que el cliente compra **al peso**. No se vende al gramo exacto: se vende **de paso en paso** (5 g, 10 g, 25 g…), que es lo que se puede pesar con fiabilidad, y con un mínimo por pedido.

- `granel` = `sí` en la primera fila. En sus filas **no** se rellenan `precio`, `precio_oferta`, `stock` ni `neto_g`/`neto_ml` (error), sino:

| Columna            | Obligatoria | Ejemplo | Hereda | Notas                                                                                         |
| ------------------ | ----------- | ------- | ------ | --------------------------------------------------------------------------------------------- |
| `paso_g`           | sí          | `5`     | sí     | Gramos de cada paso (la unidad de venta). **No se puede cambiar** una vez creada la variante. |
| `min_g`            | no          | `100`   | sí     | Mínimo por pedido, múltiplo del paso. Vacío = un paso.                                        |
| `precio_kg`        | sí          | `20`    | sí     | Euros por kilo con IVA.                                                                       |
| `precio_oferta_kg` | no          | `18`    | sí     | Menor que `precio_kg`. `-` = sin oferta. Va con su precio, como `precio_oferta`.              |
| `stock_g`          | no          | `2400`  | no     | Gramos disponibles. **Solo al crear la variante** (como `stock`).                             |

- **Precio exacto en céntimos**: el precio de un paso es `precio_kg × paso_g / 1000` y tiene que salir en céntimos exactos (20 €/kg en pasos de 5 g = 0,10 €). Si no (19,90 €/kg con 5 g = 9,95 céntimos), el `dry-run` da error y propone precios por kilo o pasos que sí cuadran. Referencia: paso 1 g → €/kg múltiplo de 10 € · 5 g → de 2 € · 10 g → de 1 € · 25 g → de 0,40 € · 50 g → de 0,20 € · 100 g → de 0,10 €.
- **Cómo queda en Medusa**: una variante con precio por paso (0,10 €). El inventario va en **gramos**: cada variante a granel tiene su artículo de inventario (mismo SKU, unidad `g`) y cada unidad vendida gasta `paso_g` gramos. Así, 2400 g de stock = 480 pasos disponibles, y la reserva al pagar descuenta los gramos.
- **Mínimo**: Medusa rechaza (400) un carrito con menos de `min_g` de esa variante («El mínimo de este producto a granel es 100 g (20 unidades de 5 g).»). Quitar la línea siempre se puede.
- Puede tener variantes (sabores): cada una con su SKU, paso y stock en gramos.
- Reponer stock: en el Admin, en el artículo de inventario del SKU, **en gramos**.
- Se guardan `metadata.granel` (producto) y `metadata.paso_g` / `metadata.min_g` (variante): es lo que leerá el storefront.

- **En la tienda** (Fase S, S-3): la tarjeta y la ficha muestran «Desde» con el precio del mínimo (100 g a 20 €/kg = 2,00 €) y debajo «20,00 €/kg · mínimo 100 g». En la ficha el cliente elige los **gramos** (− / + de paso en paso, a mano cualquier múltiplo del paso, o los accesos 100 g / 250 g / 500 g / 1 kg) hasta un máximo de 5 kg por línea, y ve «Quedan 2,4 kg». El carrito, el pedido y los emails dicen «250 g · 20,00 €/kg». El filtro y el orden por precio de la búsqueda usan también el precio del mínimo. El máximo, el total en vivo y el «Quedan» se configuran en `CATALOG_FEATURES` (storefront, `src/lib/constants.ts`).

## Descatalogar un producto

Un producto que ya no se vende **no se borra ni se pasa a borrador**: su URL tiene visitas, enlaces y posición en Google. Se marca `descatalogado` = `sí` (Fase E):

- La ficha sigue en `/producto/<handle>/` con el aviso «Este producto está descatalogado», sin botón de compra, con `noindex` y un enlace al `sustituto` (si lo hay), a su categoría o a `/productos/`.
- Sale de categorías, `/productos/`, ofertas, carrusel de la home, búsqueda, sugerencias y sitemap.
- Medusa no deja añadirlo al carrito (400 «Este producto está descatalogado y ya no se puede comprar.»). Los carritos que ya lo tenían pueden pagarlo: si no quieres, quita el stock.
- `sustituto`: handle de otro producto de esta hoja o de la tienda; no puede ser él mismo. Se guardan `metadata.descatalogado` y `metadata.sustituto`.
- Volver a venderlo: `descatalogado` = `no`.
- El cambio llega a la búsqueda al momento y a las páginas en el siguiente build.

## Fichas con plantilla y selector

Fase O. Para productos con varias opciones (p. ej. un arnés con 9 estampados × 5 tallas = 45 filas, **un solo producto**):

- **Selector**: con 2 opciones o más (o con una sola si sus valores tienen foto o color), la ficha enseña un grupo de muestras por opción en vez de la tabla de variantes. Funciona sin JS.
- **Fotos por valor**: `opcion_fotos = Estampado` y las fotos `arnes-estampado--flores_01.jpg`, `arnes-estampado--flores_02.jpg`… (valor en minúsculas, sin tildes y con guiones). Se asocian a todas las variantes con ese valor; la galería enseña las del valor elegido. Las `handle_01.jpg` siguen siendo generales (salen siempre). También se pueden asociar en el Admin («Media» de la variante).
- **Color de la muestra** (si el valor no tiene foto): en el Admin, `Opciones → Color → valor → Metadata`, clave `color` = `#c0392b`.
- **No filtrable**: en el Admin, metadata de la **opción** (`Opciones → Mosquetón lado perro → Metadata`), clave `filtrable` = `false`. Sale de los filtros de la tienda; se sigue encontrando al buscar.
- **Plantilla**: contenido común (cómo medir, consejos de uso…) en `apps/storefront/src/content/plantillas/<id>.md`. Se aplica sola a los productos de las categorías de su lista `categorias` (y de sus subcategorías), o a un producto con la columna `plantilla = <id>` (gana sobre la de la categoría; `-` = ninguna). Ejemplo: [`arnes.md`](../../../storefront/src/content/plantillas/arnes.md).

  ```markdown
  ---
  titulo: Cómo medir a tu perro # título del bloque en la ficha
  boton: Cómo medir # opcional: con botón se abre en un panel; sin él, va desplegado
  categorias:
    - arneses-perro
  ---

  Texto en Markdown (listas, negritas, tablas, fotos `![alt](./foto.jpg)` junto al .md).
  ```

- **Guía de tallas**: una por **modelo** (las tallas cambian de marca a marca), en `apps/storefront/src/content/guias/<id>.md` con `titulo` y `marca` (opcional) en la cabecera y una tabla de tallas en el cuerpo. El producto la elige con `guia_tallas = <id>`; se puede cambiar después en el Admin (metadata `guia_tallas`). Ejemplo: [`marca-m-arnes-a.md`](../../../storefront/src/content/guias/marca-m-arnes-a.md).
- El `id` es el nombre del fichero sin `.md` (minúsculas y guiones). El importador no lo comprueba: un `id` que no existe **rompe el build del storefront** con un aviso que dice qué producto y qué fichero falta. Crea el `.md` antes del build (o corrige la hoja).
- Plantillas y guías se publican con un **rebuild** del storefront.
- Ejemplo completo (estampados con fotos, guía y plantilla): [`catalog/prueba-arnes/`](../prueba-arnes/).

## Diseños

Fase DS. Un **diseño** es la maquetación entera de una ficha o de la página de una categoría (las plantillas, en cambio, son texto **dentro** de la ficha estándar). Los diseños disponibles están en `apps/storefront/src/lib/disenos.ts` (copia igual en `apps/backend/src/lib/disenos.ts`); hoy: `estandar` y `correa`.

- **Ficha**: el `diseno` del producto → el `diseno_productos` de su categoría más concreta → el de sus padres, hacia arriba → `estandar`.
- **Página de categoría**: su `diseno` → `estandar` (no se hereda entre categorías).
- Diseños **reservados**: `correa` lo pone `correas:sync`; la hoja da error si lo escribes. Tampoco se puede heredar de una categoría.
- Un id que no existe da error en el dry-run. Se cambia también en el Admin (ficha del producto o de la categoría → «Diseño…»), y se ve en la tienda tras el siguiente **build**.

## Correa a medida

Las correas configurables (largo y mosquetones, stock por piezas) **no van en `productos.csv`**: tienen sus propias hojas y su script, `correas:sync`. Ver [`correas/LEEME.md`](./correas/LEEME.md). Su categoría (`correas-perro`) sí va en `categorias.csv`.

## Fotos

Las fotos van **por producto**, con `images:import`: ficheros `handle_01.jpg`, `handle_02.jpg`… (dos cifras, de `01` a `99`, en el orden de la galería). `_01` es la miniatura y solo se admite JPG (`.jpg` o `.jpeg`). Fotos de un valor de opción (Fase O): `handle--valor_01.jpg`, ver [Fichas con plantilla y selector](#fichas-con-plantilla-y-selector). Se suben al bucket (SeaweedFS en dev, R2 en producción), a la carpeta `productos/`. Ya importadas se omiten; importar solo algunas (p. ej. una `_09` nueva) las añade en su posición sin tocar las demás; `replace` las sustituye todas.

- **Tamaño**: la tienda genera AVIF/WebP del tamaño de cada sitio (tarjeta 240 px, galería hasta 720 px). Bastan unos **1500 px** de lado mayor; más solo alarga el build. **Cuadradas** (1:1) para que la rejilla no baile.
- Los cambios de fotos se ven tras un **rebuild** del storefront.

## Producción (VPS)

Dentro del contenedor del backend (los scripts compilados están en `./src/scripts/*.js`), con `./dc` en `/opt/ecommerce` (fase 11 §4.6). La carpeta se sube antes al VPS por `scp` (no va en la imagen):

```bash
./dc cp ./mi-carga backend-server:/tmp/catalogo
./dc exec -T backend-server ./node_modules/.bin/medusa exec ./src/scripts/import-catalog.js /tmp/catalogo dry-run
./dc exec -T backend-server ./node_modules/.bin/medusa exec ./src/scripts/import-catalog.js /tmp/catalogo
./dc exec -T backend-server ./node_modules/.bin/medusa exec ./src/scripts/import-images.js /tmp/catalogo/fotos
```

Después, **rebuild del storefront** contra la API del VPS y despliegue (fase 11 §4.7) + _Purge Everything_ en Cloudflare. Plantillas y guías de tallas nuevas van en el repo del storefront: entran en ese build.
