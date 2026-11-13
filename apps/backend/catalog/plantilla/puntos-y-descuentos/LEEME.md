# Puntos y descuentos por producto

```bash
pnpm --filter backend catalog:import catalog/plantilla/categorias   # el árbol de los ejemplos (una vez)
pnpm --filter backend catalog:import catalog/plantilla/puntos-y-descuentos dry-run
pnpm --filter backend catalog:import catalog/plantilla/puntos-y-descuentos
```

| Columna          | Valor | Qué hace                                                                                                                                                          |
| ---------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `genera_puntos`  | `no`  | El producto **no genera puntos** del programa de fidelización. Vacío = no tocar (por defecto, sí genera).                                                         |
| `pago_descuento` | `no`  | **No admite códigos descuento, promociones ni pago con puntos** (`discountable` de Medusa: los puntos son una promoción y no se pueden separar). Por defecto, sí. |

- En el carrito, el checkout y la ficha sale con `*` y una nota.
- Ejemplos: `tarjeta-regalo-papel` (ni puntos ni descuentos) y `pienso-oferta-fija` (no genera puntos, pero admite descuentos).
