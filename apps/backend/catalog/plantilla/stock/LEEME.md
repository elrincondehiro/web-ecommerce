# Stock en masa (`stock:import`)

Para **reponer** (lo que ha llegado) o **cuadrar con un recuento** (inventario) muchas variantes de una vez. El stock
inicial de una variante nueva sigue poniéndose con `catalog:import` (columna `stock`); después, se cambia con esta hoja
(o en el Admin, una a una).

```bash
pnpm --filter backend stock:import catalog/plantilla/stock/stock.csv dry-run   # ver qué cambia, sin escribir
pnpm --filter backend stock:import catalog/plantilla/stock/stock.csv           # sumar (por defecto)
pnpm --filter backend stock:import ruta/a/recuento.csv fijar                   # fijar (por defecto en esa hoja)
```

La ruta es relativa a `apps/backend`. Para probar esta hoja, carga antes `producto-simple` y `producto-variantes`.

## Columnas

| Columna  | Qué es                                                                                                    |
| -------- | --------------------------------------------------------------------------------------------------------- |
| `sku`    | SKU de la variante (sin distinguir mayúsculas).                                                           |
| `ean`    | Código de barras de la variante.                                                                          |
| `handle` | Handle del producto: **solo** si tiene **una** variante (si tiene varias, error: indica el sku o el ean). |
| `stock`  | Entero ≥ 0. **Granel: en gramos** (como en `catalog:import`).                                             |
| `modo`   | Opcional, por fila: `sumar` (reponer) o `fijar` (cuadrar). Vacío = el modo de la orden.                   |

- Cada fila necesita **uno** de `sku`, `ean` o `handle` (las demás columnas pueden ir vacías o no estar). Si una fila
  trae varios, **manda el SKU** y se avisa si el EAN o el handle no coinciden.
- **Modo híbrido**: en la misma hoja, unas filas pueden `sumar` y otras `fijar`. Sin la columna `modo`, todas usan el
  de la orden: `sumar` por defecto, o `fijar` si lo pasas.
- Si una variante sale dos veces, se aplican las dos **en orden** (p. ej. fijar 10 y luego sumar 2 = 12) y se avisa.
- Lo **reservado** por pedidos en curso se respeta: si fijas por debajo de lo reservado, avisa (la variante no se podrá
  vender hasta reponer). Los productos sin control de stock (`sin_stock`, como la caja de snacks) dan error.
- Con **cualquier error**, no se cambia nada. El `dry-run` enseña `antes → después` de cada variante.
- La tienda ve el stock nuevo al momento (las islas de precio y stock); la búsqueda («Solo disponibles»), en ≤ 5 min.

Ejemplo (`stock.csv`): suma 5 a `COL-NYL-S-AZU`, fija 12 en `COL-NYL-L-AZU`, suma 3 a la variante con el EAN
`8400000000024` y fija 20 en la taza (`taza-logo`, una sola variante).
