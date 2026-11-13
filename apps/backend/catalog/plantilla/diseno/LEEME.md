# Diseño de la ficha y de la categoría

```bash
pnpm --filter backend catalog:import catalog/plantilla/categorias   # el árbol de los ejemplos (una vez)
pnpm --filter backend catalog:import catalog/plantilla/diseno dry-run
pnpm --filter backend catalog:import catalog/plantilla/diseno
```

Fase DS. Un **diseño** es la maquetación entera de una ficha o de la página de una categoría (las plantillas, en cambio, son texto **dentro** de la ficha estándar). Los diseños disponibles están en `apps/storefront/src/lib/disenos.ts` (copia igual en `apps/backend/src/lib/disenos.ts`); hoy: `estandar` y `correa`.

- **Ficha**: el `diseno` del producto → el `diseno_productos` de su categoría más concreta → el de sus padres, hacia arriba → `estandar`.
- **Página de categoría**: su `diseno` → `estandar` (no se hereda entre categorías).
- Diseños **reservados**: `correa` lo pone `correas:sync`; la hoja da error si lo escribes. Tampoco se puede heredar de una categoría.
- Un id que no existe da error en el dry-run. Se cambia también en el Admin (ficha del producto o de la categoría → «Diseño…»), y se ve en la tienda tras el siguiente **build**.

- En la hoja de productos: columna `diseno` (ejemplo: `collar-estandar`). En la de categorías: `diseno` (página) y
  `diseno_productos` (fichas de sus productos; ejemplo: `cajas-perro` en [categorías](../categorias/categorias.csv)).
