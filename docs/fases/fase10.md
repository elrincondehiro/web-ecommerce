# Fase 10 — CD: imágenes Docker

> **Estado:** 🚧 en curso (10-1 ✅ PR #36; 10-2 ✅ PR #37; 10-3 en curso)
> **Rama/PR:** `feat/docker-imagenes` (10-1) · `feat/ci-imagenes` (10-2) · `chore/ci-mejoras` (10-3) · `feat/backend-limpieza-carritos` (10-4)
> **Anterior:** [Auditoría previa](./auditoria-pre-fase10.md) · **Siguiente:** fase 11 (producción en Hetzner)

## 1. Objetivos

- [x] **10-1** Dockerfiles multi-stage de backend (server + worker) y storefront, `.dockerignore`, `compose.prod.yml` + Caddyfile mínimo, `/health` del storefront, `security.allowedDomains`, variables del storefront leídas en runtime. Pila de producción probada en local desde cero.
- [x] **10-2** `images.yml`: imágenes en **GitHub → GHCR** (push a `main` → `sha-<7>` + `main`; tag `vX.Y.Z` → `X.Y.Z`, `X.Y`, `latest`). Gitea preparado pero desactivado (variable `REGISTRY`).
- [x] **10-3** `ci.yml`: tipos de Medusa antes del typecheck (y deshacer `2f12b98`), job `integration` con `services:`, `pnpm audit --prod` (nivel alto, con excepciones), Lighthouse CI (`@lhci/cli`), caché `.astro`.
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
| Build antes del Typecheck en `quality`; se deshace `2f12b98`                                                                                                                                                                                        | `medusa build` genera `.medusa/types` (comprobado borrándolos), así `query.graph` sale tipado en CI igual que en local y sobra el tipo a mano                                                                                                                              | prueba local                                                                                                                                          |
| Job `integration` en contenedor `node:24.21.0-trixie` con `services:` llamados `postgres-localhost` / `redis-localhost`                                                                                                                             | `@medusajs/test-utils` 2.21.2 activa SSL si la URL de la BD **no** contiene «localhost» (`medusa-test-runner-utils/config.js`) y Postgres de CI no tiene SSL. En contenedor, Gitea y GitHub resuelven los servicios por nombre igual                                       | código de `@medusajs/test-utils`; prueba local con una red Docker igual a la del runner (14/14, 52 s)                                                 |
| `pnpm audit --prod` con `audit.level: high` y 3 excepciones en `pnpm-workspace.yaml`                                                                                                                                                                | Los 3 altos que quedan van solo por el CLI/codegen de `@medusajs/*` (auditoría §4.6). Los moderados no bloquean. Configurado en el repo para que `pnpm audit` dé lo mismo en local y en CI                                                                                 | context7 `/pnpm/pnpm.io` (cli/audit; releases 11.15: sección `audit`)                                                                                 |
| Lighthouse con `@lhci/cli` 0.15.1 (Lighthouse 12.6.1), 4 páginas × 3 pasadas, móvil, Chromium de Playwright                                                                                                                                         | Sin descarga de Chrome aparte (misma versión que los e2e). Accesibilidad ≥ 95, Buenas prácticas ≥ 95 y SEO 100 bloquean (sin SEO en `/carrito/`, `noindex`); Rendimiento ≥ 95 avisa. Informes solo como artefacto (14 días)                                                | context7 `/googlechrome/lighthouse-ci` (configuration.md: `assertMatrix`, `upload.target=filesystem`, `chromeFlags --no-sandbox`)                     |
| Proxy con brotli delante del storefront (`scripts/lhci-server.mjs`)                                                                                                                                                                                 | Sin compresión Lighthouse mide de más (auditoría §2: 91–94 en vez de 99). Imita a Caddy: brotli y `/_astro/*` inmutable. Solo `node:http` + `node:zlib`                                                                                                                    | auditoría pre-fase 10 §2                                                                                                                              |
| Caché de `node_modules/.astro` con `actions/cache` (clave: lockfile + fixtures)                                                                                                                                                                     | Imágenes ya optimizadas: build de fixtures de 22 s a 4 s en local                                                                                                                                                                                                          | astro-docs (`cacheDir`); context7 `/websites/gitea` (runner: cache v2 con `actions/cache` ≥ 4.2)                                                      |

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

### 4.6 CI ampliado (10-3)

| Job           | Qué hace                                                                                    | Depende de | Tiempo (local)  |
| ------------- | ------------------------------------------------------------------------------------------- | ---------- | --------------- |
| `quality`     | lint → formato → **build** → typecheck → tests unitarios → presupuesto de JS                | —          | igual que antes |
| `integration` | 4 suites / 14 tests HTTP del backend con Postgres 17 y Redis 8 de `services:`               | `quality`  | ~1 min          |
| `audit`       | `pnpm audit --prod` (altos y críticos, salvo las excepciones)                               | —          | segundos        |
| `lighthouse`  | build de fixtures + proxy brotli + `lhci autorun` (home, `/productos/`, ficha, `/carrito/`) | `quality`  | ~4,5 min        |

- `integration` y `lighthouse` esperan a `quality`: con `capacity: 2` en el LXC no corren tres jobs pesados a la vez y, si el código no compila, no se gastan minutos.
- Notas medidas en local, en la imagen del runner de Gitea como root (mediana de 3): home 99/100/100/100, `/productos/` y ficha 100/100/100/100, `/carrito/` 100/100/100/69 (SEO 69 por `noindex`, a propósito). LCP 1,5–1,9 s y CLS ≤ 0,01. Son las páginas de **fixtures** (24 productos, sin fotos): sirven para detectar regresiones, no como medida de producción (auditoría pre-fase 10 para eso).
- Rendimiento solo avisa: en runners compartidos varía de una ejecución a otra; si baja de 95, el aviso queda en el log y en el informe.
- Ver un informe: en la ejecución del job → artefacto **lighthouse** → abrir el `.report.html`.
- **Arreglo tras el merge (PR `fix/ci-integracion`)**: en GitHub `integration` fallaba con `Failed to load native binding` de `@swc/core` (lo usa Jest). Desde la 1.16, SWC descomprime su binario en una caché (`~/.cache`) y la rechaza si una carpeta padre es de otro usuario (`ERR_SWC_NATIVE_CACHE`). En GitHub el job corre como root dentro del contenedor, pero `HOME=/github/home` es del usuario del runner. En Gitea `HOME` es de root y no pasaba. Arreglo: `SWC_NATIVE_BINDING_CACHE=/root/.cache/swc` en el job (fuente: swc `docs/native-addon-carriers.md`). Reproducido y comprobado en local con un `HOME` de otro usuario (14/14).
- Avisos normales en los logs de `integration` (no se corrigen): `Search index "product" has no active version yet` (los tests van sin Meilisearch), y del Postgres de servicio `SET LOCAL can only be used in transaction blocks`, `database "…-template" does not exist` y `terminating connection due to administrator command` (test-utils crea y borra sus BD). En Lighthouse las tarjetas salen sin foto: los fixtures no tienen imágenes. La referencia de Rendimiento son las notas de GitHub; en Gitea la CPU del homelab las baja.
- **Checks obligatorios** (los añade el usuario): `integration`, `audit` y `lighthouse` junto a `quality`, en la protección de `main` de Gitea y en el ruleset de GitHub.
- Excepciones del audit: quitarlas cuando `pnpm audit --prod` deje de mostrarlas tras subir Medusa (Renovate). Si aparece un aviso alto nuevo, el job falla: se arregla con `overrides` (como en la auditoría) o, si no hay arreglo y no llega al código de producción, se añade a la lista con su motivo.

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

### 5.3 Jobs nuevos del CI en local (10-3)

```bash
pnpm audit --prod                                   # 5 moderados, 3 altos ignorados → exit 0
pnpm --filter backend test:integration:http         # 14/14 (BD temporal en el Postgres de dev)

# Lighthouse (Chromium de Playwright ya instalado: `pnpm --filter storefront exec playwright install chromium`)
STOREFRONT_DATA=fixtures pnpm --filter storefront build
cd apps/storefront
CHROME_PATH=$(node -p 'require("@playwright/test").chromium.executablePath()') \
  STOREFRONT_DATA=fixtures SITE_URL=http://127.0.0.1:4330 MEDUSA_BACKEND_URL=http://127.0.0.1:9 COOKIE_SECURE=false \
  pnpm lhci                                         # informes en .lighthouseci/informes/
pnpm exec lhci assert --assertions.categories:seo=error   # comprobar que falla: SEO de /carrito/ (exit 1)
```

Ojo: el build de fixtures sobrescribe `apps/storefront/dist`; vuelve a construir con datos de dev antes de los e2e.

## 6. Criterio de salida

- [x] Las dos imágenes se construyen y arrancan con `USER node`, `HEALTHCHECK` y solo dependencias de producción.
- [x] Pila de producción completa en local desde cero: migraciones solo en el server, worker indexando, tienda/API/Admin por Caddy.
- [ ] Merge → `:sha-*` y `:main` en GHCR (se comprueba al mergear el 10-2); tag → `:X.Y.Z` (se comprueba con el primer tag, lo crea el usuario).
- [x] CI con tipos de Medusa, integración, audit y Lighthouse (10-3). Probado en local con la imagen del runner; en CI, al abrir el PR.
- [ ] Limpieza de carritos probada (10-4).

## 7. Pendientes / riesgos

- **Fase 11**: build real del storefront contra la API del VPS (CI con la publishable key como secret o build en el VPS), R2, Origin CA, Cloudflare y primer deploy con datos mock.
- Con `NODE_ENV=production` no se pueden probar los emails con Mailpit; hace falta Resend (§4.4).
- `docker compose build` del storefront en el VPS necesita llegar a la API por su URL pública (`STOREFRONT_BUILD_BACKEND_URL`).
- Imagen del backend de 1 GB (644 MB de `node_modules` de producción de Medusa). Revisar si conviene adelgazarla más adelante.
