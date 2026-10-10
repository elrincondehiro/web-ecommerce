# Fase 10 — CD: imágenes Docker

> **Estado:** 🚧 en curso (10-1 ✅ PR #36; 10-2 en curso)
> **Rama/PR:** `feat/docker-imagenes` (10-1) · `feat/ci-imagenes` (10-2) · `chore/ci-mejoras` (10-3) · `feat/backend-limpieza-carritos` (10-4)
> **Anterior:** [Auditoría previa](./auditoria-pre-fase10.md) · **Siguiente:** fase 11 (producción en Hetzner)

## 1. Objetivos

- [x] **10-1** Dockerfiles multi-stage de backend (server + worker) y storefront, `.dockerignore`, `compose.prod.yml` + Caddyfile mínimo, `/health` del storefront, `security.allowedDomains`, variables del storefront leídas en runtime. Pila de producción probada en local desde cero.
- [x] **10-2** `images.yml`: imágenes en **GitHub → GHCR** (push a `main` → `sha-<7>` + `main`; tag `vX.Y.Z` → `X.Y.Z`, `X.Y`, `latest`). Gitea preparado pero desactivado (variable `REGISTRY`).
- [ ] **10-3** `ci.yml`: tipos de Medusa antes del typecheck (y deshacer `2f12b98`), job `integration` con `services:`, `pnpm audit --prod` (nivel alto, con excepciones), Lighthouse CI (`@lhci/cli`), caché `.astro`.
- [ ] **10-4** Job de limpieza de carritos de invitado (5 días durante las pruebas).

## 2. Decisiones tomadas

| Decisión                                                                                                                                                                                                                                            | Motivo                                                                                                                                                                                                                                                                     | Fuente consultada                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Imágenes en **GitHub (GHCR)**; Gitea preparado sin activar                                                                                                                                                                                          | El LXC del runner tiene 4 GB (build del backend ~2,4–3,7 GB), Gitea usa una CA interna y no es accesible desde el VPS; `GITEA_TOKEN` no puede publicar en el registro. En GitHub, `GITHUB_TOKEN` publica en GHCR y el repo es público                                      | context7 `/websites/gitea` (actions/comparison: «GITEA_TOKEN cannot publish to the package registry»), usuario                                        |
| Solo `linux/amd64`                                                                                                                                                                                                                                  | VPS Hetzner CPX22 (x86, 2 vCPU AMD, 4 GB)                                                                                                                                                                                                                                  | usuario                                                                                                                                               |
| `pnpm fetch` + `install --offline` + `pnpm deploy --prod` (sin `injectWorkspacePackages`)                                                                                                                                                           | Capa de dependencias válida mientras no cambie el lockfile; en pnpm ≥ 12.2 `deploy` reescribe los workspaces como `file:` y copia `emails` con su `dist/`                                                                                                                  | context7 `/pnpm/pnpm.io` (docker.md, cli/fetch, cli/deploy, releases 12.2–12.3 y 12.8)                                                                |
| `deploy` **sin** `--offline` (`--prefer-offline`)                                                                                                                                                                                                   | Con `--offline` falla la comprobación de `minimumReleaseAge` del lockfile nuevo del deploy (`ERR_PNPM_NO_OFFLINE_META`); los paquetes salen igualmente del store                                                                                                           | prueba local                                                                                                                                          |
| Backend: runtime = `.medusa/server` + `node_modules` de producción, `WORKDIR /server`, `start.sh`                                                                                                                                                   | Medusa recomienda ejecutar el build de `.medusa/server` y `/server` en Docker. `start.sh`: el server hace `db:migrate --execute-safe-links --execute-safe-search` y luego `medusa start`; el worker solo arranca                                                           | context7 `/medusajs/medusa` (learn/build, deployment/general, installation/docker) + código 2.21.2 (`commands/db/sync-links.js`, `migrate-search.js`) |
| Admin compilado **sin** `admin.backendUrl`                                                                                                                                                                                                          | El dashboard usa entonces su mismo origen (`__BACKEND_URL__ ?? "/"`): la imagen no queda atada a un dominio. Caddy reenvía `admin.dominio` al backend                                                                                                                      | context7 `/medusajs/medusa` (medusa-config `admin.backendUrl`) + `@medusajs/admin-bundler` y `dashboard` 2.21.2                                       |
| `MEDUSA_BACKEND_URL` y `PUBLIC_STRIPE_PUBLISHABLE_KEY` del storefront pasan a `access: "secret"`                                                                                                                                                    | Las `public` de servidor se fijan en el build; `secret` se lee en runtime. El contenedor usa la red interna (`http://backend-server:9000`) y la misma imagen vale para test y live. El prefijo `PUBLIC_` no la expone (Astro trata las `secret` del esquema como privadas) | astro-docs (environment-variables, integrations-guide/node) + astro 7.3.8 `env/env-loader.js`                                                         |
| `security.allowedDomains` = host de `SITE_URL` (fijado en el build)                                                                                                                                                                                 | Detrás de Caddy, Astro solo confía en `Host`/`X-Forwarded-*` que coincidan; sin esto las URL generadas llevarían `localhost`. Sin `SITE_URL` (CI) queda vacío                                                                                                              | astro-docs (configuration-reference#securityalloweddomains) + astro 7.3.8 `core/app/node.js`                                                          |
| Storefront: el catálogo se genera en el build de la imagen; publishable key como **build secret**; caché `.astro` en un cache mount                                                                                                                 | La key no queda en capas ni historial; con la caché, los builds siguientes tardan segundos. CI con `STOREFRONT_DATA=fixtures` = imagen **no desplegable** (solo valida). El build real contra la API del VPS se decide en la fase 11                                       | astro-docs (recipes/docker), Docker BuildKit (`--mount=type=secret`, `type=cache`)                                                                    |
| `compose.prod.yml`: solo Caddy publica 80/443; server y worker comparten un bloque de variables (el worker también lleva Meilisearch y emails); `DATABASE_URL` con `sslmode=disable` (Postgres interno sin TLS); Meilisearch `MEILI_ENV=production` | AGENTS §6/§7, README §11. Sin `sslmode=disable` Medusa intenta TLS con todo host que no sea `localhost`                                                                                                                                                                    | código `@medusajs/utils` 2.21.2 (`load-module-database-config.js`), meilisearch-docs (configuration reference `MEILI_ENV`)                            |
| Key propia de Meilisearch para el backend (no la master)                                                                                                                                                                                            | Acciones `search`, `documents.*`, `indexes.*`, `settings.*`, `tasks.get`, `stats.get` sobre `*` (el proveedor crea `product_v1`…). Probada: el worker indexa con ella                                                                                                      | meilisearch-docs (manage_api_keys, create-api-key) + código del proveedor 2.3.1                                                                       |
| Caddyfile mínimo con dominios por variable y `CADDY_TLS`                                                                                                                                                                                            | `tls internal` para la prueba local; la fase 11 pone Origin CA, `trusted_proxies`, cabeceras, CSP y rate limiting                                                                                                                                                          | context7 `/websites/caddyserver` (caddyfile/concepts `{$VAR:default}`, encode, reverse_proxy)                                                         |
| `node-linker` corregido en AGENTS.md                                                                                                                                                                                                                | El repo usa `isolated` (decisión de la fase 0), no `hoisted`                                                                                                                                                                                                               | fase0.md                                                                                                                                              |
| `images.yml` en GitHub con `GITHUB_TOKEN`; en Gitea solo con `vars.REGISTRY`                                                                                                                                                                        | Ver la primera fila. En GitHub no hacen falta secrets. El job de Gitea instala el CLI de Docker y usa el daemon del host (driver `docker`), que es el que confiaría en la CA interna                                                                                       | action.yml de `docker/login-action` 4.6.0 y `setup-buildx-action` 4.4.1                                                                               |
| Backend y storefront en el **mismo job, uno detrás de otro**                                                                                                                                                                                        | Nunca dos builds a la vez (memoria del LXC si se activa Gitea; en GitHub, un solo runner)                                                                                                                                                                                  | ESTADO §5                                                                                                                                             |
| Caché de capas `type=gha` con `scope` por imagen y `mode=max` (solo GitHub)                                                                                                                                                                         | Sin `scope`, las dos imágenes se pisarían la caché. `mode=max` guarda también las etapas intermedias (deps, build)                                                                                                                                                         | context7 `/docker/build-push-action` (CI: `type=gha,scope=…,mode=max`)                                                                                |
| `flavor: latest=false` + `latest` solo en tags `v*`                                                                                                                                                                                                 | metadata-action pone `latest` automáticamente con `type=semver`; así queda explícito                                                                                                                                                                                       | context7 `/docker/metadata-action` (flavor, «Latest tag»)                                                                                             |
| `main` con `github.ref == 'refs/heads/main'` (no `{{is_default_branch}}`)                                                                                                                                                                           | Independiente de cómo detecte cada plataforma la rama por defecto (mirror)                                                                                                                                                                                                 | context7 `/docker/metadata-action` (README: `type=raw` con expresión)                                                                                 |
| Storefront de CI = **fixtures**, tags con sufijo `-fixtures` y sin `latest`                                                                                                                                                                         | Comprueba el Dockerfile en cada merge sin backend; el sufijo impide desplegarla por error con `IMAGE_TAG`. El storefront desplegable se construye en la fase 11                                                                                                            | decisión del usuario (fase 10, «primer deploy con mock data»)                                                                                         |

## 3. Qué se ha hecho (10-1)

- `apps/backend/Dockerfile` + `apps/backend/docker/start.sh`.
- `apps/storefront/Dockerfile`, `src/pages/health.ts` (`/health/`, `no-store`, sin consultar el backend).
- `.dockerignore` (raíz: el contexto es el monorepo).
- `docker/compose.prod.yml`, `docker/Caddyfile`, `docker/.env.prod.example` y `docker/compose.prod.local.yml` (solo prueba local: SeaweedFS en lugar de R2 y puertos de prueba en `127.0.0.1`).
- `astro.config.mjs`: `allowedDomains`, las dos variables en runtime y `SITE_URL`/`IMAGE_BASE_URL` con `||` (un `ARG` vacío de Docker es `""`, no `undefined`).

### 3.1 Medidas (portátil, 16 hilos)

| Imagen                                           | Tamaño  | Build                              | Pico RAM (procesos del build) |
| ------------------------------------------------ | ------- | ---------------------------------- | ----------------------------- |
| `ecommerce-backend`                              | 1,02 GB | 81 s (dependencias en caché)       | ~2,4 GB                       |
| `ecommerce-storefront` (fixtures, CI)            | 576 MB  | 26 s                               | ~0,9 GB                       |
| `ecommerce-storefront` (200 productos × 4 fotos) | 580 MB  | 8 min en frío (imágenes AVIF/WebP) | ~2,0 GB                       |

En ejecución (pila de prueba): server ~425 MB, worker ~365 MB, storefront ~52 MB, Meilisearch ~100 MB, Postgres ~66 MB, Caddy ~33 MB, Redis ~26 MB. Cabe en el CPX22 (4 GB).

## 4. Cómo usarlo

### 4.1 Construir las imágenes en local

```bash
docker build -f apps/backend/Dockerfile -t ecommerce-backend:local .
# Storefront sin backend (como el CI; NO desplegable)
docker build -f apps/storefront/Dockerfile --build-arg STOREFRONT_DATA=fixtures -t ecommerce-storefront:fixtures .
```

### 4.2 Variables del storefront

- **Build** (`--build-arg`): `SITE_URL`, `IMAGE_BASE_URL`, `STOREFRONT_DATA`, `STOREFRONT_MAX_PRODUCTS`, `MEDUSA_BACKEND_URL` (la API que lee el build). Secrets: `medusa_publishable_key`, `astro_key` (opcional).
- **Runtime** (`environment:`): `MEDUSA_BACKEND_URL`, `MEDUSA_PUBLISHABLE_KEY`, `PUBLIC_STRIPE_PUBLISHABLE_KEY`, `COOKIE_SECURE`, `SERVER_TIMING`, `SEARCH_*_CACHE_TTL`.

### 4.3 Key de Meilisearch para producción

Con la master key (solo para administrar), una vez arrancado Meilisearch:

```bash
docker compose --env-file docker/.env.prod -f docker/compose.prod.yml exec -T meilisearch \
  curl -s -X POST http://127.0.0.1:7700/keys -H "Authorization: Bearer $MEILI_MASTER_KEY" \
  -H 'Content-Type: application/json' \
  --data '{"name":"medusa-backend","actions":["search","documents.*","indexes.*","settings.*","tasks.get","stats.get"],"indexes":["*"],"expiresAt":null}'
# → copiar "key" a MEILISEARCH_API_KEY en docker/.env.prod y reiniciar backend-server y backend-worker
```

### 4.4 Emails en la pila de producción

Con `NODE_ENV=production` el proveedor rechaza `EMAIL_TRANSPORT=smtp` (Mailpit es solo desarrollo, fase 8). En producción: `resend` + `RESEND_API_KEY`. Para probar sin dañar la reputación del dominio: `delivered@resend.dev`.

### 4.5 Imágenes publicadas (10-2)

- Flujo: merge en Gitea → push mirror a GitHub → `images.yml` → `ghcr.io/elrincondehiro/ecommerce-backend` y `…/ecommerce-storefront`.
- Tags:

  | Evento        | backend                             | storefront (fixtures, no desplegable)                |
  | ------------- | ----------------------------------- | ---------------------------------------------------- |
  | push a `main` | `sha-<7>`, `main`                   | `sha-<7>-fixtures`, `main-fixtures`                  |
  | tag `vX.Y.Z`  | `X.Y.Z`, `X.Y`, `latest`, `sha-<7>` | `X.Y.Z-fixtures`, `X.Y-fixtures`, `sha-<7>-fixtures` |

- Ver qué se ha publicado: GitHub → repo → Actions → «Images» (resumen con los tags) o perfil de la organización → Packages.
- **Visibilidad**: GHCR puede crear los paquetes como **privados** la primera vez (depende de la configuración de paquetes de la organización). Para que el VPS descargue sin token: Packages → `ecommerce-backend` → Package settings → Change visibility → Public (y lo mismo con `ecommerce-storefront`). Una sola vez.
- Comprobar desde cualquier máquina (sin login, una vez públicos):

  ```bash
  docker pull ghcr.io/elrincondehiro/ecommerce-backend:main
  docker run --rm --entrypoint sh ghcr.io/elrincondehiro/ecommerce-backend:main -c 'id; ls /server'
  ```

- **Activar Gitea** (si algún día el VPS puede llegar al registro del homelab): token de Gitea con permiso de paquetes (lectura y escritura) → secrets `REGISTRY_USER`/`REGISTRY_TOKEN`; variables `REGISTRY=git.hirokobu.duckdns.org` e `IMAGE_NAMESPACE=jacknoddy`; CA interna en `/etc/docker/certs.d/git.hirokobu.duckdns.org/ca.crt` del LXC. Ojo: el build del backend en el LXC de 4 GB.

## 5. Cómo testear esta fase

### 5.1 Pila de producción en local, desde cero (prueba hecha en el PR 10-1)

```bash
# 1. Variables de prueba (ignorado por git): copiar docker/.env.prod.example a docker/.env.prod.local y
#    rellenar con valores de prueba: REGISTRY=local IMAGE_NAMESPACE=web-ecommerce IMAGE_TAG=prodlocal,
#    dominios tienda/api/admin.localhost, CADDY_TLS="tls internal", S3_ENDPOINT=http://seaweedfs:8333,
#    S3_FORCE_PATH_STYLE=true, S3_FILE_URL=IMAGE_BASE_URL=http://localhost:18333/medusa,
#    STOREFRONT_BUILD_BACKEND_URL=http://localhost:19000, secretos con `openssl rand -hex 24`.
C="docker compose --env-file docker/.env.prod.local -f docker/compose.prod.yml -f docker/compose.prod.local.yml"
docker build -f apps/backend/Dockerfile -t local/web-ecommerce/ecommerce-backend:prodlocal .

# 2. Infra + key de Meilisearch (§4.3, con `$C exec -T meilisearch …`) + lectura anónima del bucket
$C up -d --wait postgres redis meilisearch seaweedfs
$C exec -T seaweedfs sh -c 'echo "s3.anonymous.set -bucket medusa -access Read,List" | weed shell'

# 3. Backend: el server migra (≈ 20 s la primera vez), el worker no
$C up -d --wait --no-build backend-server backend-worker
$C logs backend-worker | grep -c migrat          # → 0

# 4. Datos mock DENTRO del contenedor (scripts compilados en src/scripts/*.js)
$C exec -T backend-server ./node_modules/.bin/medusa exec ./src/scripts/seed.js   # → publishable key en el log
$C exec -T backend-server ./node_modules/.bin/medusa exec ./src/scripts/seed-mock.js 100
$C exec -T backend-server ./node_modules/.bin/medusa exec ./src/scripts/seed-mock-v2.js
$C exec -T backend-server ./node_modules/.bin/medusa exec ./src/scripts/seed-mock-ofertas.js
# Fotos: contenedor de un solo uso con apps/backend/.cache/mock-images montado en solo lectura
docker run --rm --network web-ecommerce-prodlocal_default \
  --env-file <(docker inspect web-ecommerce-prodlocal-backend-server-1 --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -v '^PATH=') \
  -v "$PWD/apps/backend/.cache/mock-images:/server/.cache/mock-images:ro" \
  local/web-ecommerce/ecommerce-backend:prodlocal \
  ./node_modules/.bin/medusa exec ./src/scripts/import-images.js .cache/mock-images
# Usuario del Admin
$C exec -T backend-server ./node_modules/.bin/medusa user -e admin@example.com -p '<contraseña>'

# 5. Storefront contra ese backend (poner MEDUSA_PUBLISHABLE_KEY en .env.prod.local). `docker compose
#    build` 5.x no permite la red del host sin bake --allow, así que se construye con docker build:
set -a; . docker/.env.prod.local; set +a
docker build --network host -f apps/storefront/Dockerfile \
  --build-arg SITE_URL=$SITE_URL --build-arg IMAGE_BASE_URL=$IMAGE_BASE_URL \
  --build-arg MEDUSA_BACKEND_URL=$STOREFRONT_BUILD_BACKEND_URL \
  --secret id=medusa_publishable_key,env=MEDUSA_PUBLISHABLE_KEY \
  -t local/web-ecommerce/ecommerce-storefront:prodlocal .
$C up -d --wait --no-build
```

Comprobaciones (resultado de la prueba del 10-oct-2026):

```bash
K="curl -sk --resolve tienda.localhost:443:127.0.0.1 --resolve api.localhost:443:127.0.0.1 --resolve admin.localhost:443:127.0.0.1"
$K https://tienda.localhost/health/                 # OK
$K -o /dev/null -w '%{http_code} %header{content-encoding}\n' -H 'accept-encoding: zstd' https://tienda.localhost/   # 200 zstd
$K https://tienda.localhost/ | grep canonical       # https://tienda.localhost/ (allowedDomains)
$K -sI https://tienda.localhost/_astro/<fichero>.css | grep -i cache-control   # max-age=31536000, immutable
$K https://api.localhost/health                     # OK
$K -o /dev/null -w '%{http_code} %{redirect_url}\n' https://admin.localhost/   # 302 → /app/
```

- Carrito sin JS (POST de formulario): 303 a la ficha + `#carrito-added`, cookie `cart_id` `HttpOnly; Secure; SameSite=Lax`, `private, no-store`; `/carrito/` muestra la línea. Con `Origin` falso: 403 (`checkOrigin`).
- Ficha con `<picture>` AVIF/WebP desde SeaweedFS; server island `LiveSyncData` 200; `/buscar/?q=camiseta` con resultados (Meilisearch con la key propia: 200 documentos indexados por el worker).
- Navegador (Playwright): tienda con imágenes, búsqueda y login en el Admin (`admin.localhost/app/products`, 20 filas), sin errores.
- Reinicio del server: «Database already up-to-date».

Limpiar la prueba: `$C down -v` (borra también sus volúmenes; no toca la infra de dev).

### 5.2 Calidad

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && STOREFRONT_DATA=fixtures pnpm build
pnpm --filter storefront check:budget       # OK, sin cambios de JS de cliente
pnpm --filter storefront test:e2e           # 97/97 contra el backend de dev
```

## 6. Criterio de salida

- [x] Las dos imágenes se construyen y arrancan con `USER node`, `HEALTHCHECK` y solo dependencias de producción.
- [x] Pila de producción completa en local desde cero: migraciones solo en el server, worker indexando, tienda/API/Admin por Caddy.
- [ ] Merge → `:sha-*` y `:main` en GHCR (se comprueba al mergear el 10-2); tag → `:X.Y.Z` (se comprueba con el primer tag, lo crea el usuario).
- [ ] CI con tipos de Medusa, integración, audit y Lighthouse (10-3).
- [ ] Limpieza de carritos probada (10-4).

## 7. Pendientes / riesgos

- **Fase 11**: build real del storefront contra la API del VPS (CI con la publishable key como secret o build en el VPS), R2, Origin CA, Cloudflare y primer deploy con datos mock.
- Con `NODE_ENV=production` no se pueden probar los emails con Mailpit; hace falta Resend (§4.4).
- `docker compose build` del storefront en el VPS necesita llegar a la API por su URL pública (`STOREFRONT_BUILD_BACKEND_URL`).
- Imagen del backend de 1 GB (644 MB de `node_modules` de producción de Medusa). Revisar si conviene adelgazarla más adelante.
