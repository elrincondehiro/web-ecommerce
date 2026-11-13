# Familias de las opciones (filtros)

Se carga **después** de los productos (los valores tienen que existir): este ejemplo usa los colores y tallas de
[producto-variantes](../producto-variantes/LEEME.md) y [selector-fotos](../selector-fotos/LEEME.md).

```bash
pnpm --filter backend catalog:import catalog/plantilla/familias dry-run
pnpm --filter backend catalog:import catalog/plantilla/familias
```

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
