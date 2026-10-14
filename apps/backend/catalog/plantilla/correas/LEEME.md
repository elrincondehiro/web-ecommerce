# Correa a medida — `correas:sync`

Cada **color y material** es un producto (p. ej. `/producto/correa-rojo-pvc/`). Cada producto tiene una variante por largo × mosquetón del lado del perro × mosquetón del lado de la mano: 13 × 3 × 3 = 117 con esta plantilla. Las hojas de esta carpeta las generan y actualizan; **no se editan a mano en el Admin** (la siguiente sincronización lo deshace).

```bash
# 1. Copia esta carpeta a una tuya (apps/backend/catalog/* está fuera de git, salvo plantilla/)
cp -r apps/backend/catalog/plantilla/correas apps/backend/catalog/mis-correas
# 2. La categoría (correas-perro, dentro de paseo-perro) se crea con catalog:import (categorias.csv)
# 3. Comprueba (no escribe nada) y carga
pnpm --filter backend correas:sync catalog/mis-correas dry-run
pnpm --filter backend correas:sync catalog/mis-correas
# 4. Fotos: una por producto, como el resto (images:import, correa-rojo-pvc_01.jpg)
```

## Cómo funciona el stock

Cada variante es un **kit de piezas** (inventory kit de Medusa). Al vender una correa se reservan y, al enviarla, se descuentan:

| Pieza                                       | Por correa                              |
| ------------------------------------------- | --------------------------------------- |
| Cuerda del color y material (en **metros**) | largo + `cuerda_extra_m` (7 m → 7,5 m)  |
| Mosquetón de cada lado                      | 1 + 1 (2 del mismo tipo si coinciden)   |
| Las de `piezas.csv`                         | su `por_correa` (3 anillas, 2 hebillas) |

Una variante está disponible si hay de **todas** sus piezas. La tienda solo enseña «hasta 8 m» o «agotado» y desactiva las combinaciones que no se pueden hacer; nunca dice cuánta cuerda queda.

Varias correas en el mismo carrito suman sus piezas: si dos correas de 7 m piden 15 m y quedan 9, el carrito no deja añadir la segunda («No queda material suficiente…»). Se vuelve a comprobar al pagar.

El stock **solo se fija al crear la pieza** (`stock_inicial`). Después se cambia en el Admin (Inventario → la pieza → Ajustar). `correas:sync` nunca lo toca.

### Abrir un rollo nuevo

La cuerda es **un rollo abierto por color**: los restos no se controlan. Al abrir uno nuevo, en el Admin (Inventario → `CUERDA-ROJO-PVC`) pon como stock:

> **metros del rollo nuevo + metros reservados** (la columna «Reservado»: correas vendidas aún sin enviar)

Ejemplo: rollo de 50 m, 7,5 m reservados → stock 57,5. Se admiten decimales.

### Reponer mosquetones, anillas y hebillas

Igual, en el Admin: unidades que tienes en el almacén + las reservadas.

## Las hojas

Mismas reglas que el importador de catálogo (`../LEEME.md`): CSV UTF-8, separador coma o punto y coma, filas con `#` ignoradas, decimales con coma entre comillas (`"0,5"`).

### ajustes.csv

| clave            | valor                                                                 |
| ---------------- | --------------------------------------------------------------------- |
| `categoria`      | handle de la categoría de todas las correas (debe existir)            |
| `peso_fijo_g`    | gramos de mosquetones, anillas y hebillas (para el envío)             |
| `cuerda_extra_m` | metros de cuerda de más por correa (lazos y costuras), p. ej. `"0,5"` |

### correas.csv (una fila por color y material)

- `handle`: URL `/producto/<handle>/`. **No cambiarlo** (va en los SKU de las variantes).
- `titulo`, `color`, `material`, `descripcion`.
- `color_hex` (opcional): el color de la muestra que se pinta en la tienda, en hexadecimal (`#1E5AA8`). Si falta, la muestra sale gris con el nombre del color.
- `precio_3m`: euros con IVA de la correa de 3 m con mosquetones estándar. Cada material tiene el suyo (nailon 24, PVC 25).
- `gramos_m`: gramos por metro de cuerda (PVC 80, nailon 60). Peso de la variante = `peso_fijo_g` + `gramos_m` × largo.
- `sku_cuerda`: la pieza de la cuerda (`CUERDA-ROJO-PVC`). Una por fila.
- `stock_inicial`: metros del rollo, solo al crear la pieza.
- `estado`: `publicado` / `borrador`.

### largos.csv

`largo_m` (metros enteros) y `suplemento`: euros que se suman al `precio_3m`. Plantilla: 3 m +0, 4 m +1,50, 5 m +3 y después +1 €/m hasta 15 m (+13).

Medidas intermedias: el cliente elige el metro siguiente y escribe la **medida exacta** (6,50 m en una de 7 m). Se guarda en la línea del pedido (`medida_cm`) y sale en el pedido del Admin y en los emails, con las observaciones (máximo 200 caracteres). Se cobra el metro entero y se gasta la cuerda del metro entero.

### mosquetones.csv

`codigo` (2–4 letras, va en el SKU: **no cambiarlo**), `nombre` (el que ve el cliente), `recargo` (euros por mosquetón: se cobra en cada lado), `sku` de la pieza y `stock_inicial`. El orden de las filas es el de la ficha.

### piezas.csv

Las demás piezas de cada correa: `sku`, `nombre`, `por_correa` y `stock_inicial`. La etiqueta de la marca no lleva inventario.

## Cambios habituales

- **Precios**: cambia `precio_3m`, `suplemento` o `recargo` y sincroniza. Se actualizan todas las variantes afectadas.
- **Un color nuevo**: añade una fila a `correas.csv` (con su `sku_cuerda` y los metros del rollo) y sincroniza.
- **Un largo o un mosquetón nuevo**: añade la fila y sincroniza. Se crean las variantes que faltan en todas las correas.
- **Quitar un largo o un mosquetón**: borra la fila y sincroniza. Se **borran** sus variantes; los pedidos ya hechos no cambian.
- **Retirar un color**: `estado` = `borrador` (o sin stock de cuerda, para que salga «agotado»).

## Producción

Como `catalog:import` (ver `../LEEME.md` § Producción), con `correas-sync.js`:

```bash
$C cp apps/backend/catalog/mis-correas backend-server:/tmp/correas
$C exec -T backend-server ./node_modules/.bin/medusa exec ./src/scripts/correas-sync.js /tmp/correas dry-run
$C exec -T backend-server ./node_modules/.bin/medusa exec ./src/scripts/correas-sync.js /tmp/correas
```
