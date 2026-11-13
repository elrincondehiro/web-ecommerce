# Producto con variantes (opciones)

Una fila **por variante** (collar en 2 tallas × 2 colores = 4 filas, **un solo producto**). Muestra la **herencia** de
precio, oferta y peso entre filas. Las columnas del producto son las de [producto-simple](../producto-simple/LEEME.md).

```bash
pnpm --filter backend catalog:import catalog/plantilla/categorias   # el árbol de los ejemplos (una vez)
pnpm --filter backend catalog:import catalog/plantilla/producto-variantes dry-run
pnpm --filter backend catalog:import catalog/plantilla/producto-variantes
```

## Opciones (prefijo `opcion:`)

- Hay **una columna por opción**, con el prefijo **`opcion:`** en la cabecera: `opcion:Talla`, `opcion:Color`, `opcion:Proteína`, `opcion:Tamaño`… Para una opción nueva **basta con añadir una columna** (p. ej. `opcion:Sabor`).
- Las opciones son **globales**: todos los productos comparten «Talla», «Color»… Así los filtros de la tienda suman bien. Las opciones y los valores que no existan **se crean**. El `dry-run` los lista antes («Valores nuevos en Color: Burdeos»): revísalo para cazar erratas.
- Los valores se comparan sin mayúsculas ni tildes (`azul` = `Azul`), y se usa la grafía que ya existe en la tienda.
- Cada producto rellena **solo sus opciones**, y **todas** sus variantes llevan valor en ellas. Dos variantes del mismo producto no pueden repetir combinación.
- **Producto sin variantes**: una sola fila, sin opciones. Se crea con la variante «Única» (opción «Formato»), que la tienda no muestra ni usa como filtro.
- **En la ficha**: con **una** opción, una tabla con precio y stock por variante; con **dos o más** (o una con fotos o color por valor), el [selector de muestras](../selector-fotos/LEEME.md). Cada opción con más de un producto sale como **filtro** en la tienda (salvo las marcadas como no filtrables).
- A un producto ya creado no se le pueden añadir ni quitar opciones desde la hoja; eso se hace en el Admin. Sí se pueden añadir variantes nuevas o valores nuevos.
