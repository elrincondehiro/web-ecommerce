# Selector con fotos por valor, guía de tallas y plantilla de ficha

Un arnés con 2 colores (de nombre de marca) × 3 tallas: fotos por color, guía de tallas del modelo y la plantilla «Cómo
medir» (la de la categoría `arneses-perro`, que se aplica sola). Las familias de esos colores están en
[`familias/`](../familias/LEEME.md).

```bash
pnpm --filter backend catalog:import catalog/plantilla/categorias   # el árbol de los ejemplos (una vez)
pnpm --filter backend catalog:import catalog/plantilla/selector-fotos dry-run
pnpm --filter backend catalog:import catalog/plantilla/selector-fotos
pnpm --filter backend images:import catalog/plantilla/selector-fotos/fotos
```

Fotos de esta carpeta: `arnes-colores_01.jpg` (general) y `arnes-colores--sea-foam_01.jpg`… (por color).

Fase O. Para productos con varias opciones (p. ej. un arnés con 9 estampados × 5 tallas = 45 filas, **un solo producto**):

- **Selector**: con 2 opciones o más (o con una sola si sus valores tienen foto o color), la ficha enseña un grupo de muestras por opción en vez de la tabla de variantes. Funciona sin JS.
- **Fotos por valor**: `opcion_fotos = Estampado` y las fotos `arnes-estampado--flores_01.jpg`, `arnes-estampado--flores_02.jpg`… (valor en minúsculas, sin tildes y con guiones). Se asocian a todas las variantes con ese valor; la galería enseña las del valor elegido. Las `handle_01.jpg` siguen siendo generales (salen siempre). También se pueden asociar en el Admin («Media» de la variante).
- **Color de la muestra** (si el valor no tiene foto): en el Admin, `Opciones → Color → valor → Metadata`, clave `color` = `#c0392b`.
- **No filtrable**: en el Admin, metadata de la **opción** (`Opciones → Mosquetón lado perro → Metadata`), clave `filtrable` = `false`. Sale de los filtros de la tienda; se sigue encontrando al buscar.
- **Plantilla**: contenido común (cómo medir, consejos de uso…) en `apps/storefront/src/content/plantillas/<id>.md`. Se aplica sola a los productos de las categorías de su lista `categorias` (y de sus subcategorías), o a un producto con la columna `plantilla = <id>` (gana sobre la de la categoría; `-` = ninguna). Ejemplo: [`arnes.md`](../../../../storefront/src/content/plantillas/arnes.md).

  ```markdown
  ---
  titulo: Cómo medir a tu perro # título del bloque en la ficha
  boton: Cómo medir # opcional: con botón se abre en un panel; sin él, va desplegado
  categorias:
    - arneses-perro
  ---

  Texto en Markdown (listas, negritas, tablas, fotos `![alt](./foto.jpg)` junto al .md).
  ```

- **Guía de tallas**: una por **modelo** (las tallas cambian de marca a marca), en `apps/storefront/src/content/guias/<id>.md` con `titulo` y `marca` (opcional) en la cabecera y una tabla de tallas en el cuerpo. El producto la elige con `guia_tallas = <id>`; se puede cambiar después en el Admin (metadata `guia_tallas`). Ejemplo: [`marca-m-arnes-a.md`](../../../../storefront/src/content/guias/marca-m-arnes-a.md).
- El `id` es el nombre del fichero sin `.md` (minúsculas y guiones). El importador no lo comprueba: un `id` que no existe **rompe el build del storefront** con un aviso que dice qué producto y qué fichero falta. Crea el `.md` antes del build (o corrige la hoja).
- Plantillas y guías se publican con un **rebuild** del storefront.
