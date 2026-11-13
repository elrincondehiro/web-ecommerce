# Categorías — `categorias.csv`

El árbol de la tienda. Se carga **antes** que los productos (un producto solo puede ir en una categoría que exista). Este
ejemplo es el árbol de **todos** los ejemplos de la plantilla: cárgalo primero para probarlos.

```bash
pnpm --filter backend catalog:import catalog/plantilla/categorias   # el árbol de los ejemplos (una vez)
pnpm --filter backend catalog:import catalog/plantilla/categorias dry-run
pnpm --filter backend catalog:import catalog/plantilla/categorias
```

Una fila por categoría.

| Columna            | Obligatoria | Ejemplo              | Notas                                                                                                                                                                      |
| ------------------ | ----------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `handle`           | sí          | `pienso-perro`       | Único en toda la tienda.                                                                                                                                                   |
| `nombre`           | al crear    | `Pienso`             | Empieza en mayúscula (aviso si no).                                                                                                                                        |
| `padre`            | no          | `alimentacion-perro` | **`handle`** del padre (no su nombre): otra fila de la hoja o una categoría que ya exista. Vacío = categoría principal. Si escribes el nombre, el error propone el handle. |
| `descripcion`      | no          |                      | `-` = borrarla.                                                                                                                                                            |
| `orden`            | no          | `0`                  | Posición entre las hermanas (0, 1, 2…).                                                                                                                                    |
| `activa`           | no          | `sí`                 | `sí` / `no`. Por defecto `sí`.                                                                                                                                             |
| `diseno`           | no          | `estandar`           | Fase DS. Diseño de la **página** de la categoría (no pasa a sus subcategorías). Vacío = estándar; `-` = quitarlo. Ver [Diseños](../diseno/LEEME.md).                       |
| `diseno_productos` | no          | `estandar`           | Fase DS. Diseño de las **fichas** de sus productos y de los de sus subcategorías (salvo que el producto tenga uno propio). `-` = quitarlo.                                 |

**Productos solo en la subcategoría más concreta** (`pienso-perro`, no también `alimentacion-perro` ni `perro`): la página del padre suma los productos de sus hijas.

## En la tienda

- Cada categoría tiene su página `/categoria/<handle>/` con la miga de pan (Perro › Paseo › Correas) y el menú «Tienda» de la cabecera.
- **Fila de categorías** encima de la rejilla: en un padre, sus hijas; en una hoja, sus hermanas con ella marcada; si no tiene hermanas, ella sola marcada (para subir, la miga de pan).
- `orden` decide el orden en el menú y en la fila; con el mismo `orden`, alfabético por nombre. `descripcion` sale bajo el título de la página de la categoría (admite [formato](../LEEME.md#descripciones-con-formato)) y, sin marcas y recortada a 160 caracteres, como meta descripción (SEO).
- Una categoría **sin productos publicados** (en ella o en sus hijas) no sale en la tienda. `activa = no` la oculta aunque tenga productos.
- Árbol nuevo o cambiado → **rebuild del storefront** (las páginas de categoría se generan en el build).
