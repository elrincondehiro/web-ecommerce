# Entorno «real» en local (temporal)

> **Temporal.** Sirve para preparar el catálogo real (categorías, productos, fotos y plantillas) en
> local **sin tocar** el entorno de desarrollo con los mocks. Se borra al pasar el catálogo a
> producción (ver [Limpieza](#limpieza)).

## Qué es

Un **segundo juego de infraestructura** con el mismo `docker/compose.dev.yml`, lanzado como otro
proyecto de Docker (`-p web-ecommerce-real`, con volúmenes propios), más las mismas apps con otras
variables. El **código es el mismo** (no es un worktree): tus cambios visuales y las plantillas de
`apps/storefront/src/content/` se ven a la vez en las dos tiendas.

|                    | Mocks (lo de siempre)             | Real                                     |
| ------------------ | --------------------------------- | ---------------------------------------- |
| Storefront         | http://localhost:4321             | http://localhost:4322                    |
| Backend / Admin    | http://localhost:9000/app         | http://localhost:9002/app                |
| Postgres           | :5432                             | :5433                                    |
| Redis              | :6379                             | :6380                                    |
| Meilisearch        | :7700                             | :7701                                    |
| Bucket (SeaweedFS) | http://localhost:8333/medusa      | http://localhost:8334/medusa (UI :23647) |
| Mailpit            | http://localhost:8025 (SMTP 1025) | http://localhost:8026 (SMTP 1026)        |
| Variables          | `.env`                            | `.env.real` (ignorados por git)          |

Ficheros (fuera de git, por `**/.env.*` del `.gitignore`): `docker/.env.real`,
`apps/backend/.env.real` y `apps/storefront/.env.real`, copiados de los `.env` con los puertos, los
CORS, las URL y la publishable key del entorno real. `NTFY_URL` vacío, para que un pedido de prueba no
avise al móvil.

**Cómo se eligen las variables**: `scripts/real-env.sh <app> <comando>` exporta `apps/<app>/.env.real`
y ejecuta el comando en `apps/<app>`. Medusa (`loadEnv` → dotenv) y Astro/Vite no pisan una variable
que ya está en el entorno, así que gana `.env.real`. El storefront arranca con `astro dev --ignore-lock`
(Astro 7.4): sin la opción, Astro ve tu servidor de `:4321` en la misma carpeta y se niega a arrancar
otro.

## Uso

```bash
pnpm real:infra:up            # infraestructura real (Docker)
pnpm real:backend             # Medusa en :9002 (medusa develop)
pnpm real:storefront          # Astro en :4322 (otra terminal)

# Catálogo (rutas relativas a apps/backend, igual que catalog:import / images:import)
cp -r apps/backend/catalog/plantilla apps/backend/catalog/real   # una vez; luego rellenar
pnpm real:catalog catalog/real dry-run
pnpm real:catalog catalog/real
pnpm real:images catalog/real/fotos dry-run
pnpm real:images catalog/real/fotos

pnpm real:medusa <comando>    # cualquier otro comando de medusa contra la BD real
pnpm real:infra:down          # parar (los datos se quedan en los volúmenes)
```

Mientras no haya productos, la home real da **500** («ninguna de las categorías destacadas existe»):
es la regla de la Fase H (nunca una home vacía). Al cargar el árbol y los productos, ajusta las
categorías de `home.yaml`; ojo, es el mismo fichero para las dos tiendas.

**Usuario del Admin** (una vez; la contraseña la eliges tú):

```bash
pnpm real:medusa user -e tu@correo -p '<contraseña>'
```

## Ya hecho al crearlo (28-oct-2026)

- `pnpm real:infra:up`, bucket público
  (`docker compose -p web-ecommerce-real --env-file docker/.env.real -f docker/compose.dev.yml exec -T seaweedfs sh -c 'echo "s3.anonymous.set -bucket medusa -access Read,List" | weed shell'`,
  como en la [fase 0](./fases/fase0.md)).
- `real:medusa db:migrate`, `seed` (región España, IVA, envíos, canal, publishable key, colección
  `destacados`) y `stripe:region` (Stripe test + transferencia).
- Publishable key copiada a `apps/storefront/.env.real`.

## Límites

- Pagos: no hay `stripe-cli` para este entorno, así que los webhooks de Stripe no llegan. Para probar
  el checkout usa el entorno de los mocks.
- Con las dos tiendas encendidas se usa ~1–2 GB más de RAM.
- `catalog/real/` está fuera de git: haz copia de las hojas y de las fotos fuera del repo.

## Limpieza

Cuando el catálogo esté en producción (PENDIENTES §2):

1. `pnpm real:infra:down`, y después
   `docker volume rm web-ecommerce-real_pgdata web-ecommerce-real_redisdata web-ecommerce-real_meilidata web-ecommerce-real_seaweeddata`.
2. Borrar `docker/.env.real`, `apps/backend/.env.real` y `apps/storefront/.env.real`.
3. En el **`package.json` raíz**, quitar los scripts `real:*` (`real:infra:up`, `real:infra:down`,
   `real:infra:ps`, `real:backend`, `real:storefront`, `real:catalog`, `real:images` y
   `real:medusa`). Los `package.json` de `apps/backend` y `apps/storefront` **no** se tocaron.
4. Borrar `scripts/real-env.sh` (y la carpeta `scripts/` si queda vacía), este documento y sus
   enlaces en `docs/ESTADO.md` y `docs/PENDIENTES.md`.
