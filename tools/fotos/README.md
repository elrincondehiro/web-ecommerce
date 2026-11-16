# tools/fotos — preparar las fotos del catálogo

Herramienta **interna de desarrollo** (no va en las imágenes de backend ni storefront). Deja las fotos listas para
`images:import` (`apps/backend/catalog/plantilla/LEEME.md` §Fotos).

```bash
pnpm --filter tools-fotos preparar <carpeta-origen> <carpeta-destino>
pnpm --filter backend images:import <carpeta-destino> dry-run
pnpm --filter backend images:import <carpeta-destino>
```

| Fichero                             | Sale como                   | Proceso                                                                                    |
| ----------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------ |
| `handle_01.jpg` (o png, webp, heic) | `handle_01.jpg`             | girada según el EXIF, sRGB, sin metadatos (EXIF, GPS, perfil), lado mayor 2000 px, JPEG 88 |
| `handle--valor_01.jpg`              | `handle--valor_01.jpg`      | igual (foto de un valor de opción)                                                         |
| `handle--valor_muestra.png`         | `handle--valor_muestra.png` | muestra de color del valor: 400 px, PNG con su transparencia                               |

- No recorta (la tienda recorta al cuadrado, al centro) ni amplía. Avisa de las fotos no cuadradas, de las de menos de
  1000 px y de las muestras sin transparencia.
- No renombra: lo que no sigue la convención se lista y se salta. Dos entradas con la misma salida (`a_01.jpg` y
  `a_01.png`) = error.
- No toca los originales (el destino tiene que ser otra carpeta).
- `sharp` 0.35.5 (la misma que el storefront). Tests: `pnpm --filter tools-fotos test`.
