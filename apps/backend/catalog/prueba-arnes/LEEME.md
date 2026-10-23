# Catálogo de prueba del selector de opciones (Fase O)

Dos arneses de prueba para desarrollo y para el e2e `apps/storefront/e2e/variantes.spec.ts`:

- `prueba-arnes-estampado`: 3 estampados × 5 tallas, fotos por estampado (`opcion_fotos = Estampado`), guía `marca-m-arnes-a`. Agotadas: Rayas M y L, Huellas XS.
- `prueba-arnes-basico`: 3 colores × 3 tallas, sin fotos por valor, guía `marca-m-arnes-b`. Agotada: Rojo L.

Categoría `arneses-perro` (hija de `paseo-perro`, del catálogo mock): la plantilla `arnes` del storefront se aplica sola.

```bash
pnpm --filter backend catalog:import catalog/prueba-arnes
pnpm --filter backend images:import catalog/prueba-arnes/fotos
```

El stock solo se fija al crear las variantes: para volver al estado inicial, bórralos en el Admin y vuelve a importar.
