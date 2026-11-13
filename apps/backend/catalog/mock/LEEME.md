# Catálogo de desarrollo (mocks)

Todo lo que carga la BD **local de desarrollo** y esperan los e2e del storefront. **No es una plantilla** (las plantillas
para cargar el catálogo real están en [`../plantilla/`](../plantilla/LEEME.md)) y **nunca se carga en producción**.

```bash
pnpm infra:up
pnpm --filter backend exec medusa db:migrate
pnpm backend:mock:load            # catálogo completo (1000 mocks); idempotente
pnpm backend:mock:load 1000 fotos # igual + fotos de los mocks (se descargan de picsum.photos: ~4000, tarda)
pnpm --filter backend stripe:region   # pagos (con STRIPE_API_KEY)
```

`mock:load` hace, por orden: `seed` → `catalog:mock 1000` → `catalog:import catalog/mock` → los arneses de prueba (hoja,
familias y fotos) → `correas:sync catalog/mock/correas` → la caja de snacks → [fotos de los mocks] → `stock:mock`.

| Carpeta / fichero | Qué carga                                                                                                                                                                                                     | Lo usan                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `categorias.csv`  | El árbol de la tienda (perro, gato, para ti; 38 categorías). En git.                                                                                                                                          | Todo                                                                   |
| `productos.csv`   | **Lo genera** `catalog:mock [N]` (determinista: los mismos N dan los mismos `mock-*`). Fuera de git.                                                                                                          | Casi todos los e2e                                                     |
| `arneses/`        | `prueba-arnes-estampado` (selector, fotos por estampado, guía de tallas), `prueba-arnes-basico` y `prueba-arnes-marca` (colores de marca), con `familias.csv` (12 familias de color sobre la opción «Color»). | e2e `variantes`, `familias`, `buscar`, `avisos-stock`, `accesibilidad` |
| `correas/`        | Correa a medida: 6 productos (3 colores × nailon/PVC), 13 largos, 3 mosquetones por lado.                                                                                                                     | e2e `correas`, `checkout`                                              |
| `caja/`           | Caja de snacks (15–50 €, sin stock, diseño `caja`).                                                                                                                                                           | e2e `caja`                                                             |

Otros comandos de desarrollo:

- `pnpm backend:stock:mock`: repone el stock de los `mock-*` (los e2e de checkout lo gastan).
- `pnpm backend:orders:cancel`: cancela los pedidos de prueba (`@example.com`) y libera su stock reservado.
- `pnpm --filter backend pets:mock [N] [borrar]`: mascotas de prueba para el escaparate «Vuestros peques».

**Cambiar algo de aquí** cambia lo que ven los e2e: los handles, SKU y stocks de `arneses/`, `correas/` y `caja/` están en
sus tests. El stock solo se fija al crear la variante: para volver al estado inicial, borra el producto en el Admin y
vuelve a cargar.
