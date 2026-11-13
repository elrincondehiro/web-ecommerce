# Plantillas del catálogo

Una carpeta por **caso**, cada una con su hoja de ejemplo (válida y lista para cargar) y su `LEEME.md`. Para cargar el
catálogo real, copia las que necesites a una carpeta tuya (`apps/backend/catalog/*` está fuera de git, salvo
`plantilla/` y `mock/`), rellénalas y cárgalas en este orden. El catálogo de **desarrollo** (mocks) no está aquí: es
[`../mock/`](../mock/LEEME.md).

| Orden | Carpeta                                                  | Para                                                                                  | Comando                            |
| ----- | -------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------- |
| 1     | [`categorias/`](./categorias/LEEME.md)                   | El árbol de la tienda (padre, orden, activa, descripción, diseños)                    | `catalog:import`                   |
| 2     | [`producto-simple/`](./producto-simple/LEEME.md)         | Productos sin opciones: IVA, borrador, etiquetas, colección, relacionados, oferta     | `catalog:import`                   |
| 2     | [`producto-variantes/`](./producto-variantes/LEEME.md)   | Opciones (talla × color), herencia de precio, oferta y peso, stock y SKU por variante | `catalog:import`                   |
| 2     | [`alimentacion/`](./alimentacion/LEEME.md)               | Componentes analíticos (materia seca), `analitico:*`, contenido neto (€/kg, €/l)      | `catalog:import`                   |
| 2     | [`granel/`](./granel/LEEME.md)                           | Venta al peso: paso, mínimo, €/kg, stock en gramos; con sabores                       | `catalog:import`                   |
| 2     | [`selector-fotos/`](./selector-fotos/LEEME.md)           | Selector de muestras, fotos por valor, guía de tallas y plantilla de ficha            | `catalog:import` + `images:import` |
| 2     | [`puntos-y-descuentos/`](./puntos-y-descuentos/LEEME.md) | `genera_puntos`, `pago_descuento`                                                     | `catalog:import`                   |
| 2     | [`diseno/`](./diseno/LEEME.md)                           | Diseño de la ficha por producto (y heredado de la categoría)                          | `catalog:import`                   |
| 2     | [`caja/`](./caja/LEEME.md)                               | Caja de snacks: sin stock, por importe, diseño `caja`                                 | `catalog:import`                   |
| 2     | [`correas/`](./correas/LEEME.md)                         | Correa a medida: 5 hojas propias (largos, mosquetones, piezas)                        | `correas:sync`                     |
| 3     | [`familias/`](./familias/LEEME.md)                       | Familias de los valores de una opción para los filtros (después de los productos)     | `catalog:import`                   |
| 3     | [`descatalogado/`](./descatalogado/LEEME.md)             | Retirar un producto sin borrarlo, con sustituto                                       | `catalog:import`                   |
| 4     | fotos                                                    | `handle_01.jpg`, `handle--valor_01.jpg` ([Fotos](#fotos))                             | `images:import`                    |

```bash
# Tu carga: una carpeta con categorias.csv, productos.csv (todas las filas de los casos que uses, con las columnas
# que necesites) y, si quieres, familias.csv
mkdir apps/backend/catalog/tienda && cp apps/backend/catalog/plantilla/categorias/categorias.csv apps/backend/catalog/tienda/
pnpm --filter backend catalog:import catalog/tienda dry-run    # informe, no escribe nada
pnpm --filter backend catalog:import catalog/tienda
pnpm --filter backend images:import catalog/tienda/fotos dry-run
pnpm --filter backend images:import catalog/tienda/fotos
# Publicar los cambios en la tienda: rebuild del storefront (el catálogo se genera en el build)
```

`catalog:import <carpeta>` lee `categorias.csv`, `productos.csv` y `familias.csv` de la carpeta (los que haya), por ese
orden. **Un solo `productos.csv` admite todos los casos a la vez**: las columnas son las mismas; cada ejemplo usa solo las
suyas. Para probar todos los ejemplos en una BD vacía: `categorias`, después cada carpeta de productos (y `correas:sync
catalog/plantilla/correas`) y por último `familias` y `descatalogado`. Detalle técnico: [`docs/fases/faseC-catalogo.md`](../../../../docs/fases/faseC-catalogo.md).

## Antes de empezar (catálogo real)

Decisiones que conviene tomar **antes** de rellenar cientos de filas, porque cambiarlas después cuesta:

1. **Árbol de categorías definitivo** (`categorias.csv`): los `handle` van en la URL y no se cambian. Productos solo en la hoja más concreta. Cómo se ve en la tienda: [En la tienda](./categorias/LEEME.md#en-la-tienda).
2. **Nombres de opciones y valores** comunes a toda la tienda (`Talla`, `Color`, `Tamaño`, `Sabor`…) y una sola grafía por valor: `S/M` o `S-M`, `400 g` o `400g`. Mezclarlas duplica valores en los filtros. El `dry-run` lista los valores nuevos: revísalos siempre.
3. **Etiquetas**: salen como filtro en la tienda. Pocas y con un criterio (`natural`, `sin cereales`, `cachorro`…). Las internas no deben ir aquí.
4. **Plantillas y guías de tallas** (Markdown en el storefront): cuáles hacen falta y con qué `id`, antes de escribir `plantilla`/`guia_tallas` en la hoja. Ver [selector-fotos](./selector-fotos/LEEME.md).
5. **Fotos**: nombre de fichero = `handle` (JPG), así que los handles tienen que estar decididos antes de renombrar fotos.
6. **Carga por partes**: una carpeta por tanda (p. ej. `tienda/categorias.csv` + `productos.csv` de una categoría). Cada carga solo añade o actualiza: lo que no está en la hoja no se toca.
7. **Desde Loyverse**: `migracion/loyverse/` genera estas mismas hojas (`convertir`, con stock 0); se pueden completar a mano antes de cargarlas ([README](../../../../migracion/loyverse/README.md)).

## Reglas generales

- **Formato**: CSV **UTF-8**. En Excel: _Guardar como → CSV UTF-8 (delimitado por comas)_. El separador puede ser `,` o `;`, y el importador lo detecta solo. Si el fichero no está en UTF-8, se rechaza (las tildes saldrían mal).
- **Comentarios**: las filas que empiezan por `#` se ignoran. Las plantillas llevan arriba un resumen de estas reglas: puedes dejarlo o borrarlo. Las filas vacías también se ignoran.
- **Cabeceras**: sin mayúsculas ni tildes obligatorias (`Título` = `titulo`). Las columnas opcionales se pueden quitar. Una columna desconocida es un error, para cazar erratas.
- **Celda vacía = no tocar**. Al actualizar, lo vacío conserva lo que ya hay en la tienda. Un guion `-` **borra** el valor.
- **Todo o nada**: se valida todo antes de escribir. Si hay un solo error, no se carga nada y sale un informe por fila y columna (`productos.csv:14 [precio] …`).
- **Se puede repetir**: categorías y productos se actualizan por `handle` y las variantes por `sku`. Volver a cargar la misma hoja no cambia nada. Lo que está en la tienda y no en la hoja **se ignora**: no se borra.
- **handle**: identificador en la URL (`/producto/collar-nylon/`, `/categoria/pienso-perro/`). Va en minúsculas, con números y guiones. **No lo cambies después**: sería otro producto y la URL antigua daría 404. Si es imprescindible, cámbialo en el Admin y añade la redirección en `apps/storefront/src/lib/redirects.mjs` (Fase E). Para retirar un producto, no lo borres: [descatalógalo](./descatalogado/LEEME.md). Es **único en toda la tienda**: dos subcategorías «Juguetes» (perro y gato) necesitan `juguetes-perro` y `juguetes-gato`.

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

## Fotos

Las fotos van **por producto**, con `images:import`: ficheros `handle_01.jpg`, `handle_02.jpg`… (dos cifras, de `01` a `99`, en el orden de la galería). `_01` es la miniatura y solo se admite JPG (`.jpg` o `.jpeg`). Fotos de un valor de opción (Fase O): `handle--valor_01.jpg`, ver [selector-fotos](./selector-fotos/LEEME.md). Se suben al bucket (SeaweedFS en dev, R2 en producción), a la carpeta `productos/`. Ya importadas se omiten; importar solo algunas (p. ej. una `_09` nueva) las añade en su posición sin tocar las demás; `replace` las sustituye todas.

- **Tamaño**: la tienda genera AVIF/WebP del tamaño de cada sitio (tarjeta 240 px, galería hasta 720 px). Bastan unos **1500 px** de lado mayor; más solo alarga el build. **Cuadradas** (1:1) para que la rejilla no baile.
- Los cambios de fotos se ven tras un **rebuild** del storefront.

## Producción (VPS)

Dentro del contenedor del backend (los scripts compilados están en `./src/scripts/*.js`), con `./dc` en `/opt/ecommerce` (fase 11 §4.6). La carpeta se sube antes al VPS por `scp` (no va en la imagen):

```bash
./dc cp ./tienda backend-server:/tmp/catalogo
./dc exec -T backend-server ./node_modules/.bin/medusa exec ./src/scripts/import-catalog.js /tmp/catalogo dry-run
./dc exec -T backend-server ./node_modules/.bin/medusa exec ./src/scripts/import-catalog.js /tmp/catalogo
./dc exec -T backend-server ./node_modules/.bin/medusa exec ./src/scripts/import-images.js /tmp/catalogo/fotos
```

Después, **rebuild del storefront** contra la API del VPS y despliegue (fase 11 §4.7) + _Purge Everything_ en Cloudflare. Plantillas y guías de tallas nuevas van en el repo del storefront: entran en ese build.
