# Fase 0 — Fundaciones

> **Estado:** ✅ completada (30-sep-2026) · commit `343e0ce` en `main` de Gitea y GitHub
> **Rama/PR:** commit inicial directo a `main` (única excepción; reglas desactivadas temporalmente)
> **Anterior:** [Prefase](./prefase.md) · **Siguiente:** [Fase 1 — CI básico (PR)](./fase1.md)

## 1. Objetivos

- [x] Repositorio git con remotos Gitea + GitHub (`origin` → push a ambos).
- [x] Monorepo pnpm 12 (`apps/*`, `packages/*`) con versiones exactas.
- [x] Node fijado con fnm (`.node-version` = 24.21.0).
- [x] Infraestructura de desarrollo en Docker: Postgres, Redis, Meilisearch, SeaweedFS, Mailpit, Stripe CLI (perfil).
- [x] Bucket S3 local `medusa` con lectura anónima.
- [x] Config compartida en `packages/config`: TypeScript, ESLint (flat), Prettier.
- [x] `renovate.json` (ejecución a decidir en fase 1).
- [x] `.gitignore`, `.editorconfig`, `.env.example`, `docker/.env.example`.
- [x] Primer commit y push a Gitea y GitHub (`343e0ce`).
- [x] Reactivar protección de `main` (usuario).

## 2. Qué se ha hecho

```
.node-version  .editorconfig  .gitignore  .prettierignore  .npmrc  .env.example
package.json  pnpm-workspace.yaml  pnpm-lock.yaml  renovate.json
eslint.config.js  prettier.config.js
apps/.gitkeep
packages/config/{package.json, tsconfig.base.json, eslint.config.js, prettier.config.js}
docker/{compose.dev.yml, .env.example}      (docker/.env local, ignorado)
docs/fases/{prefase.md, fase0.md, PLANTILLA.md}
```

- **`package.json` raíz**: `packageManager: pnpm@12.8.1`, `engines` exactos, scripts `infra:up|down|ps|logs|stripe`, `lint`, `lint:fix`, `format`, `format:check`, `typecheck`, `test`, `build` (los tres últimos recursivos con `--if-present`).
- **`@web-ecommerce/config`** (paquete de workspace): contiene las dependencias de lint/format; la raíz lo consume con `workspace:*`.
- **`compose.dev.yml`**: proyecto `web-ecommerce-dev`, tags de README §4.2, **puertos solo en `127.0.0.1` y configurables** por `docker/.env`, healthchecks, `up --wait`.

## 3. Decisiones tomadas

| Decisión                                                                                                                   | Motivo                                                                                                                                             | Fuente                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `.npmrc` **y** `publicHoistPattern` en `pnpm-workspace.yaml` (duplicado y sincronizado)                                    | La doc de Medusa exige `.npmrc`; pnpm ≥ 11 solo lee auth/registry de `.npmrc` y aplica la estructura de `node_modules` desde `pnpm-workspace.yaml` | docs.medusajs.com (llms-full.txt "Use pnpm with Medusa") · context7 `/websites/pnpm_io` |
| **No** `nodeLinker: hoisted`                                                                                               | Medusa no lo pide; se mantiene el aislamiento de pnpm. Se revisa en fase 2 si Medusa falla                                                         | ídem                                                                                    |
| `allowBuilds: {}`                                                                                                          | `strictDepBuilds=true` por defecto en pnpm 12; se aprueba cada paquete con scripts explícitamente                                                  | context7 `/websites/pnpm_io`                                                            |
| SeaweedFS con **`weed mini`** + `AWS_*`/`S3_BUCKET` + `s3.anonymous.set`                                                   | Un proceso, credenciales y bucket al arrancar                                                                                                      | context7 `/seaweedfs/seaweedfs`                                                         |
| Puertos parametrizables                                                                                                    | Había otro proyecto local (`tienda-dev`) ocupando 5432/6379/7700                                                                                   | incidencia real en esta fase                                                            |
| ESLint 10 flat config con `defineConfig` + `typescript-eslint` recommended + `eslint-config-prettier`; `no-console: error` | Regla de AGENTS §9 (sin `console.log`)                                                                                                             | context7 `/typescript-eslint/typescript-eslint`                                         |
| Renovate: solo `renovate.json`; ejecución (app GitHub / autoalojado en Gitea) en fase 1                                    | Decisión del usuario (opción c)                                                                                                                    | context7 `/renovatebot/renovate`                                                        |
| Credenciales dev de ejemplo en `docker/.env.example`; `docker/.env` ignorado                                               | Cambiar en producción                                                                                                                              | decisión del usuario                                                                    |

## 4. Cómo usarlo

```bash
cp docker/.env.example docker/.env      # primera vez
pnpm install
pnpm infra:up                           # arranca y espera a healthy
pnpm infra:ps | pnpm infra:logs | pnpm infra:down
pnpm infra:stripe                       # opcional, necesita STRIPE_API_KEY=sk_test_… en docker/.env
pnpm lint | pnpm lint:fix
pnpm format | pnpm format:check
```

Bucket público (solo la primera vez o tras borrar el volumen):

```bash
docker compose --env-file docker/.env -f docker/compose.dev.yml exec -T seaweedfs \
  weed shell <<< "s3.anonymous.set -bucket medusa -access Read,List"
```

| Servicio     | URL / puerto (por defecto)                              |
| ------------ | ------------------------------------------------------- |
| PostgreSQL   | `127.0.0.1:5432` (medusa/medusa)                        |
| Redis        | `127.0.0.1:6379`                                        |
| Meilisearch  | http://127.0.0.1:7700                                   |
| SeaweedFS S3 | http://127.0.0.1:8333 · admin UI http://127.0.0.1:23646 |
| Mailpit      | UI http://127.0.0.1:8025 · SMTP `127.0.0.1:1025`        |

## 5. Cómo testear esta fase

```bash
fnm current                                   # v24.21.0
pnpm -v                                       # 12.8.1
pnpm install --frozen-lockfile                # sin errores
pnpm infra:up && pnpm infra:ps                # todos running (healthy)
C="docker compose --env-file docker/.env -f docker/compose.dev.yml"
$C exec postgres pg_isready -U medusa         # accepting connections
$C exec redis redis-cli ping                  # PONG
curl -s 127.0.0.1:7700/health                 # {"status":"available"}
$C exec -T seaweedfs weed shell <<< "s3.bucket.list"   # medusa
curl -s -o /dev/null -w '%{http_code}\n' 127.0.0.1:8333/medusa/            # 200 (lectura anónima)
curl -s -o /dev/null -w '%{http_code}\n' -X PUT -d x 127.0.0.1:8333/medusa/x  # 403 (escritura anónima bloqueada)
curl -s -o /dev/null -w '%{http_code}\n' 127.0.0.1:8025/                   # 200 Mailpit
pnpm lint && pnpm format:check                # verde
git check-ignore docker/.env                  # docker/.env (ignorado)
git remote -v                                 # origin push → gitea + github
# tras el push:
git ls-remote gitea main; git ls-remote github main    # mismo SHA
pnpm infra:down
```

## 6. Criterio de salida

- [x] `pnpm install --frozen-lockfile` limpio.
- [x] Los 5 servicios healthy en `127.0.0.1` (Meilisearch: 401 sin key / 200 con key); bucket `medusa` con lectura anónima y escritura autenticada (probado con aws-cli: subida OK, GET anónimo 200, PUT anónimo 403).
- [x] `pnpm lint` y `pnpm format:check` en verde.
- [x] Mismo commit en `main` de Gitea y GitHub.
- [x] Protección de `main` reactivada en ambos.

## 7. Pendientes / riesgos

- Si otro proyecto local ocupa 5432/6379/7700…, pararlo o cambiar los puertos en `docker/.env` (ocurrió con `tienda-dev` durante esta fase).
- `typecheck`/`test`/`build` aún no hacen nada (no hay apps): se activan en fases 2–3.
- Renovate: decidir ejecución en fase 1.
- Revisar en fase 2 si Medusa necesita `nodeLinker: hoisted`.
