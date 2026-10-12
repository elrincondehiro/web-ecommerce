# Scripts archivados (`*.old`)

Archivados en la **Fase S, S-1** (oct-2026), al resetear la infra local y pasar el catálogo de
prueba a `catalog:mock` → `catalog:import` (mismo camino que el catálogo real, con el árbol de
categorías de `catalog/mock/categorias.csv`). Ver `docs/fases/faseS-catalogo-storefront.md`.

| Fichero                                 | Qué hacía                                                                                       |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `seed-mock.ts.old`                      | `seed:mock [N]`: N productos `mock-*` en 5 categorías planas (Ropa, Hogar…), fase 2             |
| `seed-mock-v2.ts.old`                   | `seed:mock:v2`: etiquetas + 100 productos `mock-v2-*` con opciones globales Talla/Color, fase 7 |
| `seed-mock-ofertas.ts.old`              | `seed:mock:ofertas`: Collection `destacados` + Price List `sale` de prueba, I-Interficie        |
| `__tests__/seed-mock*.unit.spec.ts.old` | Sus tests unitarios                                                                             |

La extensión `.old` los deja fuera de TypeScript, Jest y `medusa build`. Para rescatar uno:
quitar `.old`, volver a añadir su entrada en `scripts` de `apps/backend/package.json` (y en el
`package.json` raíz si tenía alias `backend:*`) y pasar `pnpm typecheck && pnpm test`.
Están escritos para Medusa 2.21.2; con otra versión, revisar los workflows que usan.
