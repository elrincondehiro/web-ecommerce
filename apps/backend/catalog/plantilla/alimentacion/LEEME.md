# Alimentación (analíticos y contenido neto)

Piensos, latas y snacks: componentes analíticos (tabla en la ficha y filtros sobre **materia seca** en `/buscar/` y el
comparador `/comparar/`) y contenido neto por variante (precio por kilo o por litro).

```bash
pnpm --filter backend catalog:import catalog/plantilla/categorias   # el árbol de los ejemplos (una vez)
pnpm --filter backend catalog:import catalog/plantilla/alimentacion dry-run
pnpm --filter backend catalog:import catalog/plantilla/alimentacion
```

## Componentes analíticos (primera fila)

Para piensos, latas y snacks. Porcentajes **tal cual** (como en la etiqueta), de 0 a 100, con coma o punto (`2,5`). Se guardan en la metadata del producto. `-` = borrar.

| Columna        | Ejemplo | Notas                                                                          |
| -------------- | ------- | ------------------------------------------------------------------------------ |
| `proteina_pct` | `26`    | Proteína bruta.                                                                |
| `grasa_pct`    | `15`    | Grasa bruta (aceites y grasas).                                                |
| `fibra_pct`    | `2,5`   | Fibra bruta.                                                                   |
| `cenizas_pct`  | `7,5`   | Cenizas brutas (materia inorgánica).                                           |
| `humedad_pct`  | `9`     | Humedad. **Sin ella no se podrá filtrar sobre materia seca** (aviso si falta). |

- Aviso si los componentes suman más de 100.
- **Otros componentes** solo para mostrar en la ficha: una columna `analitico:Nombre` con texto libre (`analitico:Calcio` → `1,2 %`, `analitico:Omega 3` → `0,8 %`). Se guardan como `metadata["analitico:Calcio"]`.
- En la tienda (Fase S, S-2): la ficha muestra una tabla con todos los componentes, **tal cual** y **sobre materia seca** (`x / (100 − humedad)`; los `analitico:X`, solo tal cual). En `/buscar/` se puede filtrar por **proteína y grasa sobre materia seca** (mínimo y máximo). Sin `humedad_pct`, el producto no aparece en esos filtros.

## Contenido neto

`neto_g` (gramos: 3 kg de pienso → `3000`) o `neto_ml` (mililitros: champús, lociones) en cada variante; se hereda de la fila
de arriba. La ficha y la tarjeta enseñan el precio por kilo o por litro, y el comparador el €/kg y el €/kg sobre materia seca.
