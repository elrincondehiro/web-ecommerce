# A granel

```bash
pnpm --filter backend catalog:import catalog/plantilla/categorias   # el árbol de los ejemplos (una vez)
pnpm --filter backend catalog:import catalog/plantilla/granel dry-run
pnpm --filter backend catalog:import catalog/plantilla/granel
```

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
